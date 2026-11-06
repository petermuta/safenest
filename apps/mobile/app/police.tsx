import { Linking } from 'react-native';
import { Body, Button, Card, Screen, Title } from '../src/components/ui';
import { WEB_URL } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';

/** Police officers work in the police portal (web). Assignments also arrive here as push alerts. */
export default function PoliceHome() {
  const { police, signOut } = useAuth();
  return (
    <Screen>
      <Title sub={police ? `${police.station_name} · ${police.role}` : undefined}>Police portal</Title>
      <Card tinted>
        <Body>
          SOS cases, dispatching, NIN search and the audit log are in the SafeNest police portal. Keep this app installed:
          you&apos;ll get a notification here when a case is assigned to you.
        </Body>
      </Card>
      <Button title="Open police portal" onPress={() => Linking.openURL(`${WEB_URL}/police`)} />
      <Button variant="ghost" title="Sign out" onPress={signOut} style={{ marginTop: 8 }} />
    </Screen>
  );
}
