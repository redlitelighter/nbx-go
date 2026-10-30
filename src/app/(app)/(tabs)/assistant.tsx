import React, { useState, useEffect, useRef } from 'react';
import { View, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { Screen, Button, Text } from '@/components';
import { loadModel, completion, unloadModel, heartbeat, QWEN3_600M_INST_Q4 } from '@qvac/sdk';
import { Download, Send, Bot, AlertTriangle, Check, X } from 'lucide-react-native';

type MessageRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export default function Assistant() {
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [qvacReady, setQvacReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelId, setModelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Check QVAC functional status on mount
  useEffect(() => {
    let cancelled = false;
    async function checkQvac() {
      try {
        const result = await heartbeat();
        if (!cancelled) {
          setQvacReady(typeof result === 'object' && result !== null);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setQvacReady(false);
          setError(e?.message ?? 'QVAC is not responding. Make sure the native runtime is available on this device.');
        }
      }
    }
    checkQvac();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages, loading]);

  const handleDownloadModel = async () => {
    if (!qvacReady) {
      setError('QVAC is not available. Cannot download model.');
      return;
    }
    setDownloading(true);
    setDownloadProgress('Preparing download...');
    setError(null);
    try {
      const id = await loadModel({
        modelSrc: QWEN3_600M_INST_Q4,
        onProgress: (p: unknown) => {
          const progress = p as { percentage?: number; downloaded?: number; total?: number };
          const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
          const pct = typeof progress.percentage === 'number' ? `${progress.percentage.toFixed(0)}%` : '…';
          setDownloadProgress(`Downloading ${pct} (${mb(progress.downloaded ?? 0)} / ${mb(progress.total ?? 0)})`);
        },
      });
      setModelId(id);
      setModelReady(true);
      setDownloadProgress(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-model-ready`,
          role: 'system',
          content: `Model loaded: ${id}. You can now chat.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to download/load model.');
      setDownloadProgress(null);
    } finally {
      setDownloading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!modelReady || !modelId) {
      setError('Please download the assistant model first.');
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const history = [
        ...messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user' as const, content: text },
      ];

      const run = completion({
        modelId,
        history,
        stream: true,
        captureThinking: false,
      });

      let fullText = '';
      const assistantId = `${Date.now()}-assistant`;
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);

      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          fullText += event.text;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m)),
          );
        }
      }

      const finalResult = await run.final;
      const maybeFinal = typeof (finalResult as any)?.text === 'string' ? (finalResult as any).text : null;
      const finalContent = maybeFinal && maybeFinal.trim().length > 0 ? maybeFinal.trim() : fullText;
      if (finalContent !== fullText) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: finalContent } : m)),
        );
      }
    } catch (e: any) {
      setError(e?.message ?? 'Chat failed.');
    } finally {
      setLoading(false);
    }
  };

  const renderStatusBanner = () => {
    if (!qvacReady) {
      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: moderateScale(14),
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.bgSecondary,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: moderateScale(12),
          }}
        >
          <AlertTriangle size={moderateScale(20)} color={theme.colors.error} />
          <View style={{ flex: 1 }}>
            <Text variant="small" color="textPrimary" style={{ fontWeight: '600' }}>
              QVAC not available
            </Text>
            <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>
              {error ?? 'Local LLM runtime is not reachable from this app.'}
            </Text>
          </View>
        </View>
      );
    }
    if (!modelReady) {
      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: moderateScale(14),
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.bgSecondary,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: moderateScale(12),
          }}
        >
          <Bot size={moderateScale(20)} color={theme.colors.brand} />
          <View style={{ flex: 1 }}>
            <Text variant="small" color="textPrimary" style={{ fontWeight: '600' }}>
              QVAC ready, no model loaded
            </Text>
            <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>
              Download the assistant model to start chatting.
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: moderateScale(8),
          paddingHorizontal: moderateScale(12),
          borderRadius: theme.radii.md,
          backgroundColor: theme.colors.brandTint,
          borderWidth: 1,
          borderColor: theme.colors.border,
          marginBottom: moderateScale(12),
        }}
      >
        <Check size={moderateScale(16)} color={theme.colors.brand} />
        <Text variant="small" color="brand" style={{ fontWeight: '600' }}>
          Assistant ready
        </Text>
      </View>
    );
  };

  return (
    <Screen noPadding edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={moderateScale(8)}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            padding: theme.layout.screenPaddingH,
            paddingTop: theme.layout.screenPaddingTop,
            paddingBottom: theme.layout.screenPaddingBottom,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <Text variant="h1" style={{ marginBottom: moderateScale(12) }}>
            Assistant
          </Text>
          {renderStatusBanner()}

          {error && qvacReady && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: moderateScale(14),
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.bgSecondary,
                borderWidth: 1,
                borderColor: theme.colors.border,
                marginBottom: moderateScale(12),
              }}
            >
              <AlertTriangle size={moderateScale(18)} color={theme.colors.error} />
              <Text variant="small" color="error" style={{ flex: 1 }}>
                {error}
              </Text>
              <Pressable onPress={() => setError(null)}>
                <X size={moderateScale(16)} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          )}

          <View style={{ gap: moderateScale(10), marginBottom: moderateScale(12) }}>
            {!modelReady && (
              <Button
                label={downloading ? 'Downloading model...' : 'Download Qwen3 600M (Q4)'}
                onPress={handleDownloadModel}
                loading={downloading}
                disabled={downloading || !qvacReady}
                icon={<Download size={moderateScale(18)} color={theme.colors.white} />}
              />
            )}
            {downloadProgress && (
              <Text
                variant="small"
                color="textSecondary"
                style={{ textAlign: 'center', marginTop: moderateScale(6) }}
              >
                {downloadProgress}
              </Text>
            )}
          </View>

          <View style={{ gap: moderateScale(10), marginBottom: moderateScale(12) }}>
            {messages.map((message) => (
              <View
                key={message.id}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: moderateScale(12),
                  borderRadius: theme.radii.lg,
                  backgroundColor:
                    message.role === 'user'
                      ? theme.colors.brand
                      : message.role === 'system'
                        ? theme.colors.bgSecondary
                        : theme.colors.bgSecondary,
                  borderWidth: 1,
                  borderColor:
                    message.role === 'user' ? theme.colors.brand : theme.colors.border,
                }}
              >
                <Text
                  variant="small"
                  color={message.role === 'user' ? 'white' : 'textPrimary'}
                  style={{ lineHeight: moderateScale(20) }}
                >
                  {message.content}
                </Text>
                <Text
                  variant="small"
                  color={message.role === 'user' ? 'white' : 'textSecondary'}
                  style={{ marginTop: moderateScale(4), fontSize: moderateScale(10) }}
                >
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))}
            {loading && (
              <View
                style={{
                  alignSelf: 'flex-start',
                  padding: moderateScale(12),
                  borderRadius: theme.radii.lg,
                  backgroundColor: theme.colors.bgSecondary,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Bot size={moderateScale(16)} color={theme.colors.textSecondary} />
                <Text variant="small" color="textSecondary">
                  Thinking...
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: theme.layout.screenPaddingH,
            paddingBottom: theme.layout.screenPaddingBottom,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.bgPrimary,
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything..."
            placeholderTextColor={theme.colors.textDisabled}
            editable={!loading && modelReady}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            style={{
              flex: 1,
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.bgSecondary,
              color: theme.colors.textPrimary,
              paddingHorizontal: moderateScale(12),
              paddingVertical: moderateScale(10),
              fontSize: moderateScale(14),
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={loading || !input.trim() || !modelReady}
            style={({ pressed }) => ({
              alignSelf: 'center',
              width: moderateScale(44),
              height: moderateScale(44),
              borderRadius: moderateScale(22),
              backgroundColor: pressed ? theme.colors.brandPressed : theme.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading || !input.trim() || !modelReady ? 0.5 : 1,
            })}
          >
            <Send size={moderateScale(18)} color={theme.colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
