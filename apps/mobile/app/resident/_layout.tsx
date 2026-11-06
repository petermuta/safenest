import { TabsLayout } from '../../src/components/TabsLayout';

export default function ResidentLayout() {
  return (
    <TabsLayout
      tabs={[
        { name: 'index', title: 'Home', icon: 'shield-checkmark' },
        { name: 'passes', title: 'Guests', icon: 'ticket' },
        { name: 'community', title: 'Neighbours', icon: 'people' },
        { name: 'profile', title: 'Profile', icon: 'person-circle' },
      ]}
    />
  );
}
