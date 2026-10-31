/**
 * GO — NBX-go's on-device assistant (QVAC; nothing leaves the phone).
 * NBX's slogan is "The next step"; GO talks in steps (services/goPersona.ts).
 *
 * Opening GO runs a start-up check (engine, text, vision, speech models) and
 * offers any missing model right there — no detour to the Models page.
 *
 * Text → questions about GO/NBX and "should I…?" business questions are
 * answered by GO's persona (facts + live numbers, never the model);
 * balance and price questions from live data; everything else → Qwen3 0.6B
 * returns a JSON intent (grammar-constrained) → the app validates it, asks
 * for missing slots, resolves contacts, and shows a confirmation card that
 * opens Swap, Send, Earn or a Trade limit order prefilled. GO never moves
 * funds itself.
 *
 * Each reply carries a Trace task whose steps appear as GO takes them;
 * step-themed "going" words show while it works and the send button becomes
 * a stop button that cancels the running model request.
 *
 * Image → SmolVLM2 first decides "chart or not"; non-charts are rejected,
 * charts get a short trend read. Voice → Whisper tiny.en → same pipeline.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, ScrollView, Image, Platform, Alert, UIManager, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { KeyboardState, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { X, Send, ImagePlus, Mic, Square, Sparkles, MessageSquare, LineChart, AudioLines, Cpu, Check, Download } from 'lucide-react-native';
import { Text, Button, Tap, Going, Marker, StopBar, TraceCollapsible, type MarkerStatus, type TraceTask } from '@/components';
import { scanFromURLAsync } from 'expo-camera';
import { addressFromQr } from '@/components/QrScanner';
import { useTheme } from '@/theme';
import { ALL_ROLES, activeModel, modelSize, type QvacModelRole } from '@/config/qvacModels';
import { allInstalled, ensureLoaded, probeQvac, refreshStatus, runCompletion, transcribeAudio, useQvac } from '@/services/qvacService';
import { getQuotes } from '@/services/priceService';
import { useWdkAddressForNetwork, useWdkBalances, useWdkTotalUsd } from '@/wdk/hooks/useWalletData';
import { fetchHederaTransfers, hederaAccountId } from '@/wdk/hederaHistory';
import { weekCloses } from '@/wdk/market';
import { useContacts } from '@/state/contacts';
import { withoutAutoLock } from '@/state/lockSuppression';
import { HBAR_FEE_RESERVE } from '@/hooks/useHbarForFees';
import { HEDERA_TOKEN_BY_SYMBOL } from '@/config/hederaTokens';
import {
  NBX_SLOGAN,
  STEP_WORDS,
  adviceReply,
  converse,
  explain,
  greeting,
  isMore,
  normalizeSpoken,
  nowLine,
  offTopicReply,
  syn,
  unknownQuestion,
  type Converse,
} from '@/services/goPersona';
import { PATTERN_NAMES, explainPattern, findPattern } from '@/config/chartPatterns';
import {
  CHART_DISCLAIMER,
  REFUSE_TEXT,
  XC_PREDICT,
  XC_RESPONSE_FORMAT,
  XC_SYSTEM_PROMPT,
  answerContacts,
  balanceReply,
  completeIntent,
  detectBalanceQuestion,
  detectPriceQuestion,
  detectHistoryQuestion,
  fastIntent,
  type HistoryQuery,
  isAction,
  mergeIntent,
  missingQuestion,
  parseIntent,
  priceReply,
  resolveAction,
  shortfallNote,
  type Intent,
  type Proposal,
  type TokenLine,
} from '@/services/xcIntentParser';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  image?: string;
  proposal?: Proposal; // a complete action → confirmation card
  items?: TokenLine[]; // token rows with icons (balances, prices)
  trace?: TraceTask; // what GO did for this reply
  going?: boolean; // still working
  download?: QvacModelRole; // live download progress for this model
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// The vision model only has to recognise a pattern by name; GO explains it
// from config/chartPatterns.ts (small models explain unreliably).
const CHART_PROMPT = `Look at this image. On the FIRST line write exactly CHART if it is a price chart of a market (candles, a price line, a trading view), otherwise write exactly NOT_CHART.
If it is a chart, on the SECOND line write PATTERN: followed by the one pattern you can clearly see from this list, or PATTERN: none — ${PATTERN_NAMES}.
Then in at most three short sentences describe the visible trend (up, down or sideways), any obvious support or resistance, and recent momentum, and end with BUY, SELL or WAIT and one reason.`;

const TASK_TITLE: Partial<Record<Intent['intent'], string>> = {
  buy: 'Buy', sell: 'Sell', swap: 'Swap', bridge: 'Bridge', send: 'Send', lend: 'Stake', order: 'Limit order',
  price: 'Price check', balance: 'Balance check', contacts: 'Contacts', chart_analysis: 'Chart analysis',
};

const FEATURE: Record<QvacModelRole, { label: string; what: string; Icon: React.ElementType }> = {
  llm: { label: 'Chat', what: 'Understands your requests', Icon: MessageSquare },
  vision: { label: 'Chart reading', what: 'Reads chart screenshots', Icon: LineChart },
  speech: { label: 'Voice', what: 'Turns voice notes into text', Icon: AudioLines },
};

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`);
const iconOf = (sym: string) => HEDERA_TOKEN_BY_SYMBOL[sym.toUpperCase()]?.icon;
const ADVICE_TOKEN = /\b(HBAR|SAUCE|PLEX|DOVU|DAVINCI|KARATE|USDT0?)\b/i;

/** A Trace task bound to one reply bubble; every change re-renders it. */
interface Tracer {
  title(t: string): void;
  step(label: string, detail?: string): void;
  finish(status?: MarkerStatus): void;
  readonly running: boolean;
}

export default function XcChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const states = useQvac((s) => s.states);
  const ready = allInstalled(states); // text model only
  const hasVision = states.vision.kind === 'installed';
  const hasSpeech = states.speech.kind === 'installed';
  const balances = useWdkBalances();
  const { total } = useWdkTotalUsd();
  const contacts = useContacts((s) => s.contacts);
  const { address: hederaAddress } = useWdkAddressForNetwork('hedera');

  const [booted, setBooted] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 'hello',
      role: 'assistant',
      text: greeting(),
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const pending = useRef<Intent | null>(null);
  // Pieces GO hasn't said yet ("tell me more"), dead ends in a row, and the
  // address read from the last QR screenshot.
  const more = useRef<string[]>([]);
  const deadEnds = useRef(0);
  const qr = useRef<{ address: string; amount?: string } | null>(null);
  // Auto-stop for the running request: chart reading is slower than text.
  const [workLimit, setWorkLimit] = useState(60);
  const scroll = useRef<ScrollView>(null);
  // The request in flight: its reply bubble, trace, and how to cancel it.
  const active = useRef<{ replyId: string; task: Tracer; stopped: boolean; cancel?: () => Promise<void> } | null>(null);
  const keyboard = useAnimatedKeyboard();
  // Only while the keyboard is open (Android can keep a stale height after it closes).
  const kbStyle = useAnimatedStyle(() => {
    const open = keyboard.state.value === KeyboardState.OPEN || keyboard.state.value === KeyboardState.OPENING;
    return { paddingBottom: Platform.OS === 'android' && open ? keyboard.height.value : 0 };
  });

  useEffect(() => {
    if (!useContacts.getState().loaded) useContacts.getState().load();
  }, []);
  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  }, [msgs]);

  const push = (m: Omit<Msg, 'id'>) => {
    const id = uid();
    setMsgs((x) => [...x, { ...m, id }]);
    return id;
  };
  const update = (id: string, patch: Partial<Msg>) => setMsgs((x) => x.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  /** Downloads an optional model from inside the chat, with live progress. */
  const startDownload = (role: QvacModelRole) => {
    push({ role: 'assistant', text: `Taking the next step: downloading ${activeModel(role).name} (${mb(modelSize(activeModel(role)))}).`, download: role });
    ensureLoaded(role).catch(() => {});
  };
  const offerDownload = (role: QvacModelRole, what: string) =>
    Alert.alert(`${what} needs a model`, `Download ${activeModel(role).name} (${mb(modelSize(activeModel(role)))}) once — it runs on your phone, nothing is uploaded. Use Wi-Fi.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Download', onPress: () => startDownload(role) },
    ]);

  /** Starts a reply bubble with a running Trace task. */
  const begin = (title: string) => {
    const replyId = push({ role: 'assistant', text: '', going: true });
    const task: TraceTask = { title, status: 'active', steps: [], startedAt: Date.now() };
    const commit = () => update(replyId, { trace: { ...task, steps: [...task.steps] } });
    const closeSteps = (to: MarkerStatus) =>
      (task.steps = task.steps.map((s) => (s.status === 'active' ? { ...s, status: to } : s)));
    const tracer: Tracer = {
      title(t) {
        task.title = t;
        commit();
      },
      step(label, detail) {
        if (task.status !== 'active') return;
        closeSteps('done');
        task.steps.push({ id: uid(), label, status: 'active', detail });
        commit();
      },
      finish(status = 'done') {
        if (task.status !== 'active') return;
        closeSteps(status);
        task.status = status;
        task.endedAt = Date.now();
        commit();
      },
      get running() {
        return task.status === 'active';
      },
    };
    const ctx = { replyId, task: tracer, stopped: false as boolean, cancel: undefined as undefined | (() => Promise<void>) };
    active.current = ctx;
    /** Final reply; ignored once the user pressed stop. */
    const say = (t: string, patch: Partial<Msg> = {}, status: MarkerStatus = 'done') => {
      if (ctx.stopped) return;
      update(replyId, { text: t, going: false, ...patch });
      tracer.finish(status);
    };
    return { ctx, task: tracer, say };
  };

  const stop = async (timedOut = false) => {
    const ctx = active.current;
    if (!ctx) return setBusy(false);
    ctx.stopped = true;
    await ctx.cancel?.();
    update(ctx.replyId, {
      text: timedOut
        ? 'That took too long, so I stopped it. Try again — it’s faster once the model is warm.'
        : 'Stopped. Ready for the next step when you are.',
      going: false,
    });
    ctx.task.finish('stopped');
    active.current = null;
    setBusy(false);
  };

  const handleText = async (raw: string, echo = true) => {
    // "h bah" → HBAR, "USDT zero" → USDT0 (voice notes spell tokens as they sound).
    const text = normalizeSpoken(raw);
    if (echo) push({ role: 'user', text });
    const { ctx, task, say } = begin('Understanding your request');
    /** A rule-based reply; remembers the rest of it for "tell me more". */
    const sayConverse = (c: Extract<Converse, { kind: 'say' }>) => {
      pending.current = null;
      more.current = c.more ?? [];
      task.title(c.title);
      say(c.text);
    };
    // Balances come from the wallet (fetched fresh when GO opens), never the model.
    const replyBalance = (asset?: string) => {
      pending.current = null;
      task.title(asset ? `${asset} balance` : 'Balance check');
      task.step('Counting your steps on Hedera', 'From your wallet');
      if (balances.isLoading) return say('Still loading your balances — ask me again in a moment.');
      const r = balanceReply(balances.data ?? [], total, asset);
      say(r.text, { items: r.items });
    };
    // Prices come from live data (SaucerSwap / Bitfinex), never the model.
    const replyPrice = async (token: string) => {
      pending.current = null;
      task.title(`${token} price`);
      task.step(`Fetching the ${token} price`, 'SaucerSwap');
      const r = priceReply(token, (await getQuotes([token]))[token]);
      say(r.text, { items: r.items });
    };
    // Past transactions straight from the Hedera mirror node, never the model.
    const replyHistory = async (q: HistoryQuery) => {
      pending.current = null;
      task.title(q.direction === 'in' ? 'Received' : q.direction === 'out' ? 'Sent' : 'Recent transactions');
      if (!hederaAddress) return say('Your wallet address is still loading — ask me again in a moment.');
      task.step('Checking Hedera', 'Mirror node');
      const all = await fetchHederaTransfers(hederaAddress, 50);
      const rows = all
        .filter((t) => (!q.direction || t.direction === q.direction) && (!q.token || t.symbol === q.token))
        .slice(0, q.count);
      // Show saved contacts by name instead of 0.0.x account ids.
      task.step('Matching your contacts');
      const names = new Map<string, string>();
      await Promise.all(
        contacts.flatMap((c) =>
          c.addresses
            .filter((a) => a.network === 'hedera')
            .map(async (a) => {
              const id = await hederaAccountId(a.address);
              if (id) names.set(id, c.name);
            }),
        ),
      );
      if (!rows.length) {
        return say(
          `No ${q.direction === 'in' ? 'incoming ' : q.direction === 'out' ? 'outgoing ' : ''}${q.token ? `${q.token} ` : ''}transactions yet. ` +
            'Your first step: [[deposit HBAR or USDT0]] to your Hedera address.',
        );
      }
      const ago = (ts: number) => {
        const m = Math.round((Date.now() - ts) / 60000);
        return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
      };
      say(`Your last ${rows.length === 1 ? 'transaction' : `${rows.length} transactions`} on Hedera:`, {
        items: rows.map((t) => ({
          symbol: t.symbol,
          primary: `${t.direction === 'in' ? '+' : '−'}${t.amount} ${t.symbol === 'XSAUCE' ? 'xSAUCE' : t.symbol}`,
          secondary: `${t.direction === 'in' ? 'from' : 'to'} ${t.counterparty ? names.get(t.counterparty) ?? t.counterparty : 'unknown'} · ${ago(t.timestamp)}${t.status === 'failed' ? ' · failed' : ''}`,
        })),
      });
    };
    try {
      task.step('Reading your message');
      // "Tell me more": the next piece of the last explanation, one at a time.
      if (isMore(text) && more.current.length) {
        task.title('More');
        const [next, ...rest] = more.current;
        more.current = rest;
        return say(rest.length ? `${next} [[tell me more]]` : next);
      }
      // A QR code GO just read: send to it, or save it as a contact.
      if (qr.current && /^\s*send to (this|that|the) address\s*$/i.test(text)) {
        const { address, amount } = qr.current;
        qr.current = null;
        pending.current = { intent: 'send', slots: { recipient: address, ...(amount ? { amount: Number(amount) } : {}) } };
        task.title('Send');
        return say(`Sending to ${address.slice(0, 8)}…${address.slice(-6)}. Which token${amount ? '' : ' and how much'}? For example [[USDT0]] or [[5 HBAR]].`);
      }
      if (qr.current && /^\s*save (it )?(as )?(a )?contact\s*$/i.test(text)) {
        const { address } = qr.current;
        qr.current = null;
        task.title('Save contact');
        say('Opening Contacts — give it a name and save.');
        router.push({ pathname: '/contacts', params: { add: address } });
        return;
      }
      if (!pending.current) {
        // Urgent help, app commands, small talk, time, GO/NBX facts: rules, not the model.
        const c = converse(text, deadEnds.current);
        deadEnds.current = c?.kind === 'say' && c.title === 'Standing by' ? deadEnds.current + 1 : 0;
        if (c?.kind === 'nav') {
          pending.current = null;
          task.title(c.title);
          say(c.text);
          Keyboard.dismiss();
          router.push(c.route as any);
          return;
        }
        if (c?.kind === 'say') return sayConverse(c);
        if (c?.kind === 'advice') {
          task.title('Crunching the numbers');
          const sym = text.match(ADVICE_TOKEN)?.[1]?.toUpperCase().replace(/^USDT$/, 'USDT0');
          const t = sym ? HEDERA_TOKEN_BY_SYMBOL[sym] : undefined;
          if (t) {
            task.step('Summoning the gods of code', 'SaucerSwap market data');
            const [q, week] = await Promise.all([getQuotes([t.symbol]).then((m) => m[t.symbol]), weekCloses(t.id).catch(() => [])]);
            const held = balances.data?.find((b) => b.token.symbol === t.symbol && Number(b.amount) > 0)?.amount;
            task.step('Calculating steps');
            const a = adviceReply({ token: t.symbol, price: q?.price, change24h: q?.change24h, week, held: held ? String(Number(Number(held).toFixed(6))) : undefined });
            more.current = a.more;
            return say(a.text, {
              items: q ? [{ symbol: t.symbol, primary: `$${q.price < 0.01 ? q.price.toPrecision(4) : q.price.toFixed(4)}`, secondary: q.change24h != null ? `${q.change24h >= 0 ? '+' : ''}${q.change24h.toFixed(2)}% 24h` : undefined }] : undefined,
            });
          }
          return say(adviceReply({}).text);
        }
        const bal = detectBalanceQuestion(text);
        if (bal) return replyBalance(bal.slots.token);
        const price = detectPriceQuestion(text);
        if (price) return await replyPrice(price.slots.token!);
        const hist = detectHistoryQuestion(text);
        if (hist) return await replyHistory(hist);
        // Open-ended questions GO can explain ("what is staking?").
        const ex = explain(text);
        if (ex?.kind === 'say') return sayConverse(ex);
      }

      // Keyword fast path first ("send 5 hbar to alice", "swap 100 hbar to
      // plex"); follow-up answers ("alice", "5") merge without the model too.
      // The on-device model only runs for phrasing the rules can't place.
      const fast = fastIntent(text, contacts);
      let intent: Intent | null = null;
      if (pending.current) {
        intent = mergeIntent(pending.current, fast, text, contacts);
        task.step('Filling in the details', 'Instant');
      } else if (fast) {
        intent = fast;
        task.step('Understood', 'Instant — no model needed');
      } else {
        task.step('Thinking', 'On-device model');
        const history = [
          { role: 'system' as const, content: `${XC_SYSTEM_PROMPT}\n\nNow: ${nowLine()}.` },
          ...msgs.slice(-4).filter((m) => !m.image && m.text).map((m) => ({ role: m.role, content: m.text })),
          { role: 'user' as const, content: text },
        ];
        const out = await runCompletion('llm', history, undefined, {
          responseFormat: XC_RESPONSE_FORMAT,
          predict: XC_PREDICT,
          onCancelable: (c) => (ctx.cancel = c),
        });
        ctx.cancel = undefined;
        if (ctx.stopped) return;
        const parsed = parseIntent(out);
        intent = parsed && completeIntent(parsed, text, contacts);
      }

      if (!intent) {
        return say(unknownQuestion(text) ?? 'Let’s take that one step at a time — say it another way, like [[buy 25 USDT of SAUCE]] or [[send 10 USDT0 to Alice]].');
      }
      const token = intent.slots.token ?? intent.slots.toToken;
      task.title([TASK_TITLE[intent.intent], token].filter(Boolean).join(' ') || 'Request');

      switch (intent.intent) {
        case 'refuse':
          pending.current = null;
          task.title('Out of scope');
          return say(unknownQuestion(text) ?? offTopicReply());
        case 'clarify':
          return say(intent.message || 'Could you say that another way?');
        case 'balance':
          return replyBalance(intent.slots.token);
        case 'contacts':
          pending.current = null;
          task.step('Reading your contacts');
          return say(answerContacts(contacts));
        case 'chart_analysis':
          pending.current = null;
          if (!hasVision) {
            offerDownload('vision', 'Chart reading');
            return say('Chart reading needs its model — I’ve offered the download.');
          }
          return say('Send me a chart screenshot with the image button and I’ll read the trend.');
      }
      if (!isAction(intent.intent)) return say(offTopicReply());

      task.step('Calculating steps');
      const question = missingQuestion(intent);
      if (question) {
        pending.current = intent;
        return say(question);
      }
      if (intent.intent === 'price') return await replyPrice(intent.slots.token!);

      const r = intent.slots.recipient;
      if (intent.intent === 'send' && r && typeof r !== 'string') task.step(`Looking up “${r.name}” in your contacts`);
      task.step('Lining up your next step');
      const res = resolveAction(intent, contacts);
      if (!res.ok) {
        if (res.retry) {
          const slots = { ...intent.slots };
          for (const k of res.retry) delete slots[k];
          pending.current = { ...intent, slots };
        } else pending.current = null;
        return say(res.message);
      }
      pending.current = null;
      // Every Hedera transaction is paid in HBAR — flag it before the user gets stuck.
      const hbarRow = balances.data?.find((b) => b.token.id === 'hbar-hedera');
      const hbarLeft = hbarRow && hbarRow.amount !== '—' ? Number(hbarRow.amount) : null;
      const feeNote =
        hbarLeft != null && hbarLeft < HBAR_FEE_RESERVE
          ? ` Heads up: you have ${hbarLeft.toFixed(4)} HBAR — not enough for the network fee. [[Buy HBAR]] or deposit some first.`
          : hbarLeft != null && hbarLeft < 2
            ? ` You’re low on HBAR (${hbarLeft.toFixed(2)}) — keep some for fees.`
            : '';
      say(`${syn('here')} your ${syn('step')}. Tap [[Review and confirm]] — nothing moves until you approve it there.${shortfallNote(balances.data ?? [], res.proposal.spend)}${feeNote}`, {
        proposal: res.proposal,
      });
    } catch (e: any) {
      say(`I tripped on that step: ${e?.message ?? 'model error'}`, {}, 'error');
    } finally {
      if (active.current === ctx) active.current = null;
    }
  };

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    // Orange suggestions that are screen actions rather than requests.
    if (/^review and confirm$/i.test(text)) return;
    setBusy(true);
    await handleText(text);
    // After a stop, a newer request may already be running — leave it busy.
    if (!active.current) setBusy(false);
  };
  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await sendText(text);
  };

  /** The image button asks first: a chart to read, or a QR code to use. */
  const attach = () => {
    if (busy) return;
    Alert.alert('What’s in the picture?', 'GO reads both on your phone — nothing is uploaded.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'QR code', onPress: () => scanQrImage() },
      { text: 'Price chart', onPress: () => readChart() },
    ]);
  };

  /** A screenshot of an address QR code → send to it or save it as a contact. */
  const scanQrImage = async () => {
    const res = await withoutAutoLock(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 }));
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    setBusy(true);
    push({ role: 'user', text: 'QR code screenshot', image: uri });
    const { ctx, task, say } = begin('QR code');
    try {
      task.step('Looking for a QR code', 'On your phone');
      const found = await scanFromURLAsync(uri, ['qr']);
      const data = found[0]?.data;
      if (!data) return say('I couldn’t find a QR code in that picture. Crop it so the code fills most of the screenshot and try again.');
      const address = addressFromQr(data);
      if (!/^0x[a-fA-F0-9]{40}$/.test(address) && !/^0\.0\.\d+$/.test(address)) {
        return say('That QR code isn’t a Hedera address, so I won’t use it. Ask the sender for their Hedera (0x… or 0.0.…) address QR.');
      }
      const amount = data.match(/[?&]amount=([\d.]+)/)?.[1];
      task.step('Found a Hedera address');
      const known = contacts.find((c) => c.addresses.some((a) => a.address.toLowerCase() === address.toLowerCase()));
      qr.current = { address, amount };
      say(
        `${known ? `That’s ${known.name}’s address` : 'Found a Hedera address'}: ${address.slice(0, 8)}…${address.slice(-6)}` +
          `${amount ? `, asking for ${amount}` : ''}. Next step — [[send to this address]]${known ? '' : ' or [[save as contact]]'}?`,
      );
    } catch (e: any) {
      say(`I couldn’t read that picture: ${e?.message ?? 'scan error'}`, {}, 'error');
    } finally {
      if (active.current === ctx) active.current = null;
      setBusy(false);
    }
  };

  const readChart = async () => {
    if (!hasVision) return offerDownload('vision', 'Chart reading');
    // The system photo picker pauses our Activity — don't let that lock the wallet.
    const res = await withoutAutoLock(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 }));
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    setWorkLimit(120);
    setBusy(true);
    push({ role: 'user', text: 'Chart screenshot', image: uri });
    const { ctx, task, say } = begin('Chart analysis');
    try {
      task.step('Checking it’s a price chart', 'On-device vision model');
      const out = await runCompletion(
        'vision',
        [{ role: 'user', content: CHART_PROMPT, attachments: [{ path: uri.replace(/^file:\/\//, '') }] }],
        undefined,
        { onCancelable: (c) => (ctx.cancel = c) },
      );
      if (ctx.stopped) return;
      const [first, ...rest] = out.trim().split('\n');
      if (!/^\s*CHART\b/i.test(first) || /NOT_CHART/i.test(first)) {
        say('That isn’t a price chart — lovely picture, though. Send a candlestick or price chart screenshot and I’ll read it.');
      } else {
        task.step('Reading the trend, step by step');
        // Pattern line first (the model names it; GO explains it from the dictionary).
        const patternLine = rest.find((l) => /^\s*PATTERN\s*:/i.test(l));
        const pattern = patternLine && !/none/i.test(patternLine) ? findPattern(patternLine) : null;
        if (pattern) task.step(`Spotted a ${pattern.name}`, pattern.signal === 'either' ? 'can break either way' : `${pattern.signal} pattern`);
        const read =
          rest.filter((l) => l !== patternLine).join(' ').trim() || 'It’s a chart, but I couldn’t read a clear trend from it.';
        say(`${read}${pattern ? `\n\n${explainPattern(pattern)}` : ''}\n\n${CHART_DISCLAIMER}`);
      }
    } catch (e: any) {
      say(`I couldn’t read the image: ${e?.message ?? 'vision error'}`, {}, 'error');
    } finally {
      if (active.current === ctx) active.current = null;
      setBusy(false);
      setWorkLimit(60);
    }
  };

  /**
   * Voice has its own button, separate from Send: the old shared button
   * turned into a mic the moment a message was sent, so a second tap (or
   * the keyboard's send) started a recording. Starting only ever happens
   * from the mic button; stopping (button, stop bar or countdown) only stops.
   */
  const stopVoice = async () => {
    if (!recording) return;
    {
      setRecording(null);
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (!uri) return;
        setBusy(true);
        const { ctx, task, say } = begin('Voice note');
        task.step('Transcribing', 'On-device speech model');
        const text = (await transcribeAudio(uri.replace(/^file:\/\//, ''))).trim();
        if (ctx.stopped) return;
        if (!text) return say('I didn’t catch that — try again a little closer to the mic.');
        // Shown as heard, with tokens fixed up ("h bah" → HBAR).
        say(`Heard: “${normalizeSpoken(text)}”`);
        active.current = null;
        await handleText(text, false);
      } catch (e: any) {
        push({ role: 'assistant', text: `I couldn’t transcribe that: ${e?.message ?? 'speech error'}` });
      } finally {
        setBusy(false);
      }
    }
  };

  const startVoice = async () => {
    if (recording || busy) return;
    if (!hasSpeech) return offerDownload('speech', 'Voice');
    const perm = await withoutAutoLock(() => Audio.requestPermissionsAsync());
    if (!perm.granted) {
      push({ role: 'assistant', text: 'Microphone access is off. Turn it on in system settings to talk to GO.' });
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    // 16 kHz mono is what Whisper expects.
    const { recording: rec } = await Audio.Recording.createAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      android: { ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android, sampleRate: 16000, numberOfChannels: 1 },
      ios: { ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios, sampleRate: 16000, numberOfChannels: 1 },
    });
    setRecording(rec);
  };

  const round = { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const };

  return (
    <SafeAreaView className="page-xc" style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text variant="tokenName">GO</Text>
          <Text variant="small" color="textSecondary">{NBX_SLOGAN} · on-device</Text>
        </View>
        <Tap onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <X size={22} color={theme.colors.textPrimary} />
        </Tap>
      </View>

      {!booted || !ready ? (
        <GoBoot onReady={() => setBooted(true)} />
      ) : (
        <Animated.View style={[{ flex: 1 }, kbStyle]}>
          <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
            {msgs.map((m) => (
              <View key={m.id} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <View
                  style={{
                    maxWidth: '86%',
                    minWidth: m.trace || m.items?.length ? '70%' : undefined,
                    padding: 12,
                    borderRadius: 18,
                    gap: 10,
                    backgroundColor: m.role === 'user' ? theme.colors.bgTertiary : theme.colors.bgSecondary,
                  }}
                >
                  {m.image ? <Image source={{ uri: m.image }} style={{ width: 200, height: 140, borderRadius: 12 }} /> : null}
                  {m.trace ? <TraceCollapsible task={m.trace} /> : null}
                  {m.going ? (
                    <Going words={['going', ...STEP_WORDS]} />
                  ) : m.text ? (
                    <RichText text={m.text} onAction={m.role === 'assistant' && !busy ? (a) => sendText(a) : undefined} />
                  ) : null}
                  {m.items?.length ? <TokenLines items={m.items} /> : null}
                  {m.download ? <DownloadProgress role={m.download} /> : null}
                  {m.proposal ? <IntentCard proposal={m.proposal} onOpen={() => router.push(m.proposal!.route as any)} /> : null}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* While GO works: a pulsing stop button and a countdown that stops
              it by itself (60 s, or 120 s for charts). Voice has no limit —
              it records until the red stop button is tapped. */}
          {busy && !recording ? <StopBar mode="working" seconds={workLimit} onStop={(timedOut) => stop(timedOut)} /> : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: theme.colors.bgPrimary }}>
            <Tap onPress={attach} disabled={busy || !!recording} accessibilityLabel="Attach chart or QR code" style={{ ...round, backgroundColor: theme.colors.bgSecondary }}>
              <ImagePlus size={20} color={busy || recording ? theme.colors.textDisabled : theme.colors.textPrimary} />
            </Tap>
            {/* Voice: its own button, on the left, away from Send. */}
            <Tap
              onPress={recording ? stopVoice : startVoice}
              disabled={busy && !recording}
              accessibilityLabel={recording ? 'Stop recording' : 'Record a voice note'}
              style={{ ...round, backgroundColor: recording ? theme.colors.error : theme.colors.bgSecondary }}
            >
              {recording ? (
                <Square size={14} color="#fff" fill="#fff" />
              ) : (
                <Mic size={20} color={busy ? theme.colors.textDisabled : theme.colors.textPrimary} />
              )}
            </Tap>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={recording ? 'Listening… tap stop when done' : busy ? 'Calculating steps…' : 'Buy 25 USDT of SAUCE…'}
              placeholderTextColor={theme.colors.textDisabled}
              editable={!busy && !recording}
              onSubmitEditing={send}
              returnKeyType="send"
              style={{
                flex: 1,
                height: 44,
                borderRadius: 22,
                paddingHorizontal: 16,
                backgroundColor: theme.colors.bgSecondary,
                color: theme.colors.textPrimary,
                fontSize: 15,
              }}
            />
            {busy && !recording ? (
              // Stop: cancels the running model request.
              <Tap onPress={() => stop()} accessibilityLabel="Stop" style={{ ...round, backgroundColor: theme.colors.textPrimary }}>
                <Square size={14} color={theme.colors.bgPrimary} fill={theme.colors.bgPrimary} />
              </Tap>
            ) : (
              // Send: text only — never records, greyed out until there's text.
              <Tap
                onPress={send}
                disabled={!input.trim() || !!recording}
                accessibilityLabel="Send"
                style={{ ...round, backgroundColor: input.trim() && !recording ? theme.colors.brand : theme.colors.bgSecondary }}
              >
                <Send size={18} color={input.trim() && !recording ? '#fff' : theme.colors.textDisabled} />
              </Tap>
            )}
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

/**
 * Start-up check: wakes the on-device engine, checks each model, and lists
 * what GO can do. Missing models download right here. Continues to the chat
 * once the text model is installed.
 */
function GoBoot({ onReady }: { onReady: () => void }) {
  const theme = useTheme();
  const states = useQvac((s) => s.states);
  const [engine, setEngine] = useState<MarkerStatus>('active');
  const [checked, setChecked] = useState(false);
  const ready = allInstalled(states);

  useEffect(() => {
    let alive = true;
    (async () => {
      await probeQvac();
      if (!alive) return;
      setEngine('done');
      await refreshStatus();
      if (alive) setChecked(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Straight into the chat once everything checks out (or the text model lands).
  useEffect(() => {
    if (checked && ready) {
      const t = setTimeout(onReady, 500);
      return () => clearTimeout(t);
    }
  }, [checked, ready, onReady]);

  const markerFor = (role: QvacModelRole): MarkerStatus => {
    const st = states[role];
    if (!checked || st.kind === 'unknown' || st.kind === 'downloading') return 'active';
    if (st.kind === 'installed') return 'done';
    if (st.kind === 'error') return 'error';
    return 'pending';
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
          <Cpu size={28} color={theme.colors.brand} />
        </View>
        <Text variant="h2" style={{ marginTop: 12 }}>{checked ? (ready ? 'GO is ready' : 'One step to go') : 'Getting GO ready'}</Text>
        <View style={{ marginTop: 6 }}>
          {checked ? (
            <Text variant="body" color="textSecondary" center>
              {ready ? 'Stepping into the chat…' : 'GO needs its text model to chat. Everything runs on your phone.'}
            </Text>
          ) : (
            <Going words={['calculating steps', 'checking your models', 'stepping foot on the engine']} />
          )}
        </View>
      </View>

      <View style={{ padding: 16, borderRadius: 20, backgroundColor: theme.colors.bgSecondary, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Marker status={engine} />
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ fontWeight: '600' }}>On-device engine</Text>
            <Text variant="small" color="textSecondary">QVAC — nothing leaves your phone</Text>
          </View>
        </View>
        {ALL_ROLES.map((role) => {
          const def = activeModel(role);
          const st = states[role];
          const f = FEATURE[role];
          const Icon = f.Icon;
          return (
            <View key={role} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Marker status={markerFor(role)} />
                <Icon size={18} color={theme.colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: '600' }}>
                    {f.label}
                    {role === 'llm' ? '' : ' · optional'}
                  </Text>
                  <Text variant="small" color="textSecondary">
                    {f.what} · {def.name} · {mb(modelSize(def))}
                  </Text>
                </View>
                {checked && st.kind === 'installed' ? <Check size={18} color={theme.colors.success} /> : null}
                {checked && (st.kind === 'missing' || st.kind === 'error') ? (
                  <Tap
                    onPress={() => ensureLoaded(role).catch(() => {})}
                    accessibilityLabel={`Download ${f.label}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: role === 'llm' ? theme.colors.brand : theme.colors.bgTertiary }}
                  >
                    <Download size={14} color={role === 'llm' ? '#fff' : theme.colors.textPrimary} />
                    <Text variant="small" style={{ fontWeight: '600', color: role === 'llm' ? '#fff' : theme.colors.textPrimary }}>
                      {st.kind === 'error' ? 'Retry' : 'Get'}
                    </Text>
                  </Tap>
                ) : null}
              </View>
              {st.kind === 'downloading' ? <ProgressBar progress={st.progress} /> : null}
              {st.kind === 'error' ? <Text variant="small" color="error">{st.message}</Text> : null}
            </View>
          );
        })}
      </View>

      {checked && ready ? <Button label="Open chat" onPress={onReady} /> : null}
      {ALL_ROLES.some((r) => states[r].kind === 'downloading') ? (
        <View style={{ padding: 14, borderRadius: 16, backgroundColor: theme.colors.brandTint }}>
          <Text variant="body" style={{ fontWeight: '600' }}>Keep NBX-go open</Text>
          <Text variant="small" color="textSecondary">Leaving the app or locking the phone can stop the download. Stay here until it finishes.</Text>
        </View>
      ) : null}
      <Text variant="small" color="textDisabled" center>Use Wi-Fi for downloads. Voice and chart reading can be added any time.</Text>
    </ScrollView>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const theme = useTheme();
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.bgTertiary, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, Math.min(100, progress))}%`, height: 4, backgroundColor: theme.colors.brand }} />
    </View>
  );
}

/** Live progress for a model downloaded from inside the chat. */
function DownloadProgress({ role }: { role: QvacModelRole }) {
  const st = useQvac((s) => s.states[role]);
  if (st.kind === 'installed') return <Text variant="small" color="success">Ready — {FEATURE[role].label.toLowerCase()} is now one step away.</Text>;
  if (st.kind === 'error') return <Text variant="small" color="error">{st.message}</Text>;
  return (
    <View style={{ gap: 6 }}>
      <ProgressBar progress={st.kind === 'downloading' ? st.progress : 0} />
      <Text variant="small" color="textSecondary">{st.kind === 'downloading' ? `${Math.round(st.progress)}%` : 'Starting…'}</Text>
    </View>
  );
}

/**
 * GO's reply text: plain commentary in the normal text colour, with
 * [[actions and suggestions]] in bold NBX orange. Tapping one sends it as
 * the next message.
 */
function RichText({ text, onAction }: { text: string; onAction?: (action: string) => void }) {
  const theme = useTheme();
  const parts = text.split(/\[\[(.+?)\]\]/g);
  return (
    <Text variant="body">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Text
            key={i}
            variant="body"
            onPress={onAction ? () => onAction(p) : undefined}
            style={{ color: theme.colors.brand, fontWeight: '600' }}
          >
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

function TokenIcon({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const theme = useTheme();
  const uri = iconOf(symbol);
  return uri ? (
    <Image source={uri} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.bgTertiary }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="small" style={{ fontWeight: '600' }}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

function TokenLines({ items }: { items: TokenLine[] }) {
  const theme = useTheme();
  return (
    <View style={{ borderRadius: 14, backgroundColor: theme.colors.bgTertiary, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <View
          key={`${it.symbol}-${i}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: theme.colors.border }}
        >
          <TokenIcon symbol={it.symbol} />
          <Text variant="body" style={{ flex: 1, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{it.primary}</Text>
          {it.secondary ? (
            <Text
              variant="small"
              color={it.secondary.startsWith('-') ? 'error' : it.secondary.startsWith('+') ? 'success' : 'textSecondary'}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {it.secondary}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function IntentCard({ proposal, onOpen }: { proposal: Proposal; onOpen: () => void }) {
  const theme = useTheme();
  const tokens = proposal.tokens ?? [];
  return (
    <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.colors.bgTertiary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {tokens.length ? (
          <View style={{ flexDirection: 'row' }}>
            {tokens.slice(0, 2).map((s, i) => (
              <View key={s} style={{ marginLeft: i ? -8 : 0, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.bgTertiary }}>
                <TokenIcon symbol={s} size={28} />
              </View>
            ))}
          </View>
        ) : null}
        <Text variant="small" color="textSecondary">Your next step</Text>
      </View>
      <Text variant="body" style={{ fontWeight: '600', marginTop: 8 }}>{proposal.summary}</Text>
      <Tap
        onPress={onOpen}
        style={{ marginTop: 10, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand }}
      >
        <Text variant="button" style={{ color: '#fff', fontWeight: '600' }}>Review and confirm</Text>
      </Tap>
    </View>
  );
}
