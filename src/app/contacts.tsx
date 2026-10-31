/**
 * Contacts — list, add, edit and delete saved addresses (one per network).
 * Tapping an address copies it; "Use" passes it back to a caller that
 * opened Contacts as a picker (`?pick=<network>`, e.g. from Swap).
 */
import React, { useEffect, useState } from 'react';
import { View, FlatList, Pressable, Modal, Alert, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Plus, Pencil, Trash2, Copy, X, ScanLine } from 'lucide-react-native';
import { validateEVMAddress } from '@tetherto/wdk-utils';
import { Screen, ScreenHeader, Text, Button, Card, Pill } from '@/components';
import { useTheme } from '@/theme';
import { useContacts, type Contact, type ContactAddress } from '@/state/contacts';
import { useToast } from '@/state/toast';
import { setPickedAddress } from '@/state/contactPick';
import { QrScanner } from '@/components/QrScanner';

const NETWORKS: { key: string; label: string; validate: (a: string) => boolean }[] = [
  // NBX-go is Hedera-only. Older contacts may still hold other chains; they
  // show with their own label but new addresses are Hedera.
  { key: 'hedera', label: 'Hedera', validate: (a) => validateEVMAddress(a).success },
];
const OLD_LABELS: Record<string, string> = { arbitrum: 'Arbitrum', ethereum: 'Ethereum', bitcoin: 'Bitcoin', solana: 'Solana', tron: 'Tron' };
const LABEL: Record<string, string> = { ...OLD_LABELS, ...Object.fromEntries(NETWORKS.map((n) => [n.key, n.label])), evm: 'EVM' };
const EVM_NETWORKS = new Set(['hedera', 'arbitrum', 'ethereum']);

/** `pick=evm` matches any EVM network — the same address works on all of them. */
function matches(pick: string, network: string) {
  return pick === 'evm' ? EVM_NETWORKS.has(network) : pick === network;
}

function short(a: string) {
  return a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

export default function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  // `add`: an address to save as a new contact (from GO's QR reader).
  const { pick, add } = useLocalSearchParams<{ pick?: string; add?: string }>();
  const { contacts, load, upsert, remove } = useContacts();
  const [editing, setEditing] = useState<Contact | 'new' | null>(add ? 'new' : null);

  useEffect(() => {
    load();
  }, [load]);

  const shown = pick ? contacts.filter((c) => c.addresses.some((a) => matches(pick, a.network))) : contacts;

  const onDelete = (c: Contact) =>
    Alert.alert('Delete contact', `Delete ${c.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(c.id) },
    ]);

  const onAddress = async (a: ContactAddress) => {
    if (pick) {
      setPickedAddress(a.address);
      router.back();
      return;
    }
    await Clipboard.setStringAsync(a.address);
    useToast.getState().show('Address copied');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title={pick ? `Pick ${LABEL[pick] ?? pick} address` : 'Contacts'}
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => setEditing('new')} hitSlop={10}>
            <Plus size={22} color={theme.colors.brand} />
          </Pressable>
        }
      />
      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
        renderItem={({ item }) => (
          <Card style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.brandTint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="tokenName" color="brand">{item.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text variant="tokenName" style={{ flex: 1, marginLeft: 10 }}>{item.name}</Text>
              {!pick ? (
                <>
                  <Pressable onPress={() => setEditing(item)} hitSlop={8} style={{ padding: 6 }}>
                    <Pencil size={16} color={theme.colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => onDelete(item)} hitSlop={8} style={{ padding: 6 }}>
                    <Trash2 size={16} color={theme.colors.error} />
                  </Pressable>
                </>
              ) : null}
            </View>
            {item.addresses
              .filter((a) => !pick || matches(pick, a.network))
              .map((a) => (
                <Pressable
                  key={a.network}
                  onPress={() => onAddress(a)}
                  style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}
                >
                  <Text variant="small" color="textSecondary" style={{ width: 70 }}>{LABEL[a.network] ?? a.network}</Text>
                  <Text style={{ fontVariant: ['tabular-nums'], flex: 1, fontSize: 13 }}>{short(a.address)}</Text>
                  {pick ? (
                    <Text variant="small" color="brand" style={{ fontWeight: '600' }}>Use</Text>
                  ) : (
                    <Copy size={14} color={theme.colors.textSecondary} />
                  )}
                </Pressable>
              ))}
          </Card>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 48, gap: 12 }}>
            <Text variant="body" color="textSecondary" center>
              {pick ? 'No contacts with an address on this network.' : 'No contacts yet.'}
            </Text>
            <Button label="Add contact" variant="tinted" onPress={() => setEditing('new')} />
          </View>
        }
      />

      <ContactEditor
        contact={editing === 'new' ? null : editing}
        prefill={editing === 'new' ? add : undefined}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSave={async (c) => {
          await upsert(c);
          setEditing(null);
        }}
      />
    </Screen>
  );
}

function ContactEditor({
  contact,
  prefill,
  visible,
  onClose,
  onSave,
}: {
  contact: Contact | null;
  /** Hedera address to start a new contact with. */
  prefill?: string;
  visible: boolean;
  onClose: () => void;
  onSave: (c: { id?: string; name: string; addresses: ContactAddress[] }) => Promise<void>;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<ContactAddress[]>([]);
  const [network, setNetwork] = useState('hedera');
  const [address, setAddress] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(contact?.name ?? '');
    setRows(contact?.addresses ?? []);
    setNetwork('hedera');
    setAddress(prefill ?? '');
  }, [visible, contact, prefill]);

  const net = NETWORKS.find((n) => n.key === network)!;
  const addressValid = address.trim().length > 0 && net.validate(address.trim());

  const addRow = () => {
    if (!addressValid) return;
    setRows((r) => [...r.filter((x) => x.network !== network), { network, address: address.trim() }]);
    setAddress('');
  };

  const canSave = name.trim().length > 0 && rows.length > 0;

  const input = {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.bgSecondary,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  } as const;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text variant="headTitle">{contact ? 'Edit contact' : 'New contact'}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="always">
          <Text variant="small" color="textSecondary">Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Alice" placeholderTextColor={theme.colors.textSecondary} style={input} />

          <Text variant="small" color="textSecondary" style={{ marginTop: 8 }}>Addresses</Text>
          {rows.map((r) => (
            <View key={r.network} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="small" style={{ width: 70 }}>{LABEL[r.network]}</Text>
              <Text style={{ fontVariant: ['tabular-nums'], flex: 1, fontSize: 13 }}>{short(r.address)}</Text>
              <Pressable onPress={() => setRows((x) => x.filter((y) => y.network !== r.network))} hitSlop={8}>
                <Trash2 size={16} color={theme.colors.error} />
              </Pressable>
            </View>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="small" color="textSecondary">Hedera address (0x…)</Text>
            <Pressable onPress={() => setScanning(true)} hitSlop={8} accessibilityLabel="Scan address QR code" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ScanLine size={16} color={theme.colors.brand} />
              <Text variant="small" color="brand" style={{ fontWeight: '600' }}>Scan QR</Text>
            </Pressable>
          </View>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={`${net.label} address`}
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[input, { fontSize: 14, fontVariant: ['tabular-nums'] }]}
          />
          {address.trim() && !addressValid ? (
            <Text variant="small" color="error">Not a valid {net.label} address</Text>
          ) : null}
          <Button label={`Add ${net.label} address`} variant="tinted" onPress={addRow} disabled={!addressValid} />
        </ScrollView>
        <QrScanner visible={scanning} onClose={() => setScanning(false)} onScan={setAddress} title="Scan contact address" />
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Button
            label="Save contact"
            disabled={!canSave}
            onPress={() => onSave({ id: contact?.id, name: name.trim(), addresses: rows })}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
