import { ChoiceSheet } from '../components/ChoiceSheet';

interface BlockUserSheetProps {
  visible: boolean;
  targetName: string;
  isBlocked?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function BlockUserSheet({
  visible,
  targetName,
  isBlocked = false,
  onConfirm,
  onClose,
}: BlockUserSheetProps) {
  if (!visible) return null;

  if (isBlocked) {
    return (
      <ChoiceSheet
        cancelLabel="Keep blocked"
        choices={[
          {
            label: `Unblock ${targetName}`,
            onPress: () => {
              onClose();
              onConfirm();
            },
          },
        ]}
        message={`${targetName} will be able to see you in matching recommendations and send ride requests again.`}
        onClose={onClose}
        title={`Unblock ${targetName}?`}
        visible={visible}
      />
    );
  }

  return (
    <ChoiceSheet
      cancelLabel="Cancel"
      choices={[
        {
          label: `Block ${targetName}`,
          destructive: true,
          onPress: () => {
            onClose();
            onConfirm();
          },
        },
      ]}
      message={`They won't be able to match with you, view your commute details, or message you. You can unblock them anytime in Account > Safety.`}
      onClose={onClose}
      title={`Block ${targetName}?`}
      visible={visible}
    />
  );
}
