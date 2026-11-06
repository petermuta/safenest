import { TabsLayout } from '../../src/components/TabsLayout';

export default function StaffLayout() {
  return (
    <TabsLayout
      tabs={[
        { name: 'index', title: 'Gate', icon: 'scan' },
        { name: 'log', title: 'Visitors', icon: 'list' },
        { name: 'alerts', title: 'Alerts', icon: 'warning' },
      ]}
    />
  );
}
