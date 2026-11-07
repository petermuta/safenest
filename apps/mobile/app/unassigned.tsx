import { formatUgPhone } from '@safenest/shared';
import { useState } from 'react';
import { Body, Button, Card, Screen, Title } from '../src/components/ui';
import { confirmDeleteAccount } from '../src/lib/delete-account';
import { useAuth } from '../src/lib/auth';

/** Signed in, but no estate has registered this phone number yet. */
export default function Unassigned() {
  const { profile, refresh, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <Title sub="Almost there">You're not on an estate yet</Title>
      <Card tinted>
        <Body>
          Ask your estate manager or landlord to add your number{' '}
          <Body style={{ fontWeight: '700' }}>{formatUgPhone(profile?.phone ?? '')}</Body> to SafeNest. Once they do,
          tap the button below.
        </Body>
      </Card>
      <Card>
        <Body muted>
          Managing an estate? Register it on the SafeNest web dashboard, then add your units, residents and guards
          there.
        </Body>
      </Card>
      <Button
        title="I've been added — check again"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await refresh();
          setBusy(false);
        }}
      />
      <Button variant="ghost" title="Sign out" onPress={signOut} style={{ marginTop: 8 }} />
      <Button variant="ghost" title="Delete my account" onPress={() => confirmDeleteAccount(signOut)} />
    </Screen>
  );
}
