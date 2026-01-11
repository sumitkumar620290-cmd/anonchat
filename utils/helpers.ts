
export const generateId = () => Math.random().toString(36).substring(2, 15);

export const generateUsername = () => `GHOST-${Math.floor(Math.random() * 90000 + 10000)}`;

export const generateReconnectCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const formatTime = (timestamp: number) => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  }).format(new Date(timestamp));
};
