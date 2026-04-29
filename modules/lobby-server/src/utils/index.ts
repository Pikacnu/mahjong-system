import type { Message, MessageSourceEnum } from 'utils/src/websocket';

export const validatePlayerMessage = (
  messageObj: unknown,
): Message<MessageSourceEnum.Player> => {
  if (
    typeof messageObj !== 'object' ||
    messageObj === null ||
    !('messageType' in messageObj) ||
    !('payload' in messageObj) ||
    typeof (messageObj as any).messageType !== 'number'
  ) {
    throw new Error('Invalid message format: not an object');
  }
  return messageObj as Message<MessageSourceEnum.Player>;
};
