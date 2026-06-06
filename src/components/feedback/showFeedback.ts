import toast from 'react-hot-toast';
import { messages } from '../../i18n/messages';

export function showFeedback(code: string, type: 'success' | 'error' | 'warning' = 'success') {
  // If the code is not found in our predefined messages, use a default error message
  const message = messages[code as keyof typeof messages] || messages.SERVER_ERROR;

  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      // React Hot Toast does not have a warning type out of the box, use a custom icon
      toast(message, { icon: '⚠️' });
      break;
    default:
      toast(message);
  }

  return message;
}
