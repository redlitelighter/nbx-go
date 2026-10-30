/**
 * QrScanner — full-screen camera that reads one wallet-address QR code
 * (expo-camera). Asks for camera permission on first use and explains how
 * to turn it on if refused. Accepts plain addresses and URI forms like
 * `ethereum:0x…`, `hedera:0x…@295?amount=…` — returns just the address.
 */
import React, { useEffect, useRef } from 'react';
import { Linking, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X, Camera } from 'lucide-react-native';
import { Text } from './Text';
import { Tap } from './Tap';
import { Button } from './Button';
import { useTheme } from '@/theme';
import { withoutAutoLock } from '@/state/lockSuppression';

/** The address part of a scanned payload. */
export function addressFromQr(data: string): string {
  const t = data.trim();
  const evm = t.match(/0x[a-fA-F0-9]{40}/);
  if (evm) return evm[0];
  const hedera = t.match(/\b0\.0\.\d+\b/);
  if (hedera) return hedera[0];
  // scheme:address?params → address
  return t.replace(/^[a-z]+:/i, '').split(/[?@]/)[0];
}

export function QrScanner({
  visible,
  onClose,
  onScan,
  title = 'Scan a wallet QR code',
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (address: string) => void;
  title?: string;
}) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  useEffect(() => {
    if (visible) {
      done.current = false;
      if (permission && !permission.granted && permission.canAskAgain) withoutAutoLock(() => requestPermission());
    }
  }, [visible, permission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (done.current || !data) return;
              done.current = true;
              onScan(addressFromQr(data));
              onClose();
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
            <Camera size={40} color="#fff" />
            <Text variant="h2" style={{ color: '#fff' }} center>Camera access needed</Text>
            <Text variant="body" style={{ color: '#bbb' }} center>
              NBX-go uses the camera only to read address QR codes. Nothing is recorded or uploaded.
            </Text>
            {permission && !permission.canAskAgain ? (
              <Button label="Open settings" onPress={() => Linking.openSettings()} />
            ) : (
              <Button label="Allow camera" onPress={() => withoutAutoLock(() => requestPermission())} />
            )}
          </View>
        )}

        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
            <Text variant="tokenName" style={{ color: '#fff' }}>{title}</Text>
            <Tap onPress={onClose} hitSlop={12} accessibilityLabel="Close scanner" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <X size={22} color="#fff" />
            </Tap>
          </View>
        </SafeAreaView>

        {permission?.granted ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: theme.colors.brand }} />
            <Text variant="small" style={{ color: '#fff', marginTop: 16 }}>Point at an address QR code</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
