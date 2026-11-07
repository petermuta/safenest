import { Alert } from 'react-native';
import { api, errorMessage } from './api';

/**
 * Asks twice, then permanently deletes the resident's account and personal data
 * (NIN, photo, posts, guest passes). Required by Apple for apps with sign-up.
 */
export function confirmDeleteAccount(signOut: () => Promise<void>) {
  Alert.alert(
    'Delete your account?',
    'This permanently deletes your NIN, photo, community posts and guest passes. Past SOS records are kept for the police without your name. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you sure?', 'Your account will be deleted now.', [
            { text: 'Keep my account', style: 'cancel' },
            {
              text: 'Delete forever',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api('/api/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
                  await signOut();
                  Alert.alert('Account deleted', 'Your SafeNest account and personal data have been deleted.');
                } catch (e) {
                  Alert.alert('Not deleted', errorMessage(e));
                }
              },
            },
          ]),
      },
    ],
  );
}
