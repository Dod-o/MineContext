import { FC, MouseEvent } from 'react'
import logoImage from '@renderer/assets/icons/ai-assistant/logo.png'

import { ChatHistoryListItem } from './chat-history-list-item'
import { useLocalizedText } from '@renderer/hooks/use-app-language'
export interface ChatHistoryListProps {
  conversationList: any[]
  handleGetMessages?: (e: MouseEvent, conversationId: number) => void
  onConversationUpdate?: () => void
  refreshConversationList?: () => void
}

const ChatHistoryList: FC<ChatHistoryListProps> = (props) => {
  const { conversationList, refreshConversationList, handleGetMessages } = props
  const t = useLocalizedText()

  if (conversationList.length === 0) {
    return (
      <div className="w-[270px] p-4 text-center text-gray-500 flex items-center justify-center flex-col">
        <img src={logoImage} alt="No chat history" className="w-[62px] h-[46px]" />
        <div className="text-[12px] leading-[22px]">{t('Ops...No chats yet', '暂无聊天记录')}</div>
      </div>
    )
  }
  return (
    <div className="w-[270px] h-[70%] p-[8px]">
      <div className="text-[14px] leading-[22px] text-[#0c0d0e] font-medium mb-[8px] px-[12px] py-[2px]">
        {t('Recent chats', '最近聊天')}
      </div>
      <div className="overflow-x-hidden overflow-y-auto max-h-[calc(100vh_-_400px)]">
        {conversationList.map((conversation) => (
          <ChatHistoryListItem
            conversation={conversation}
            key={conversation.id}
            refreshConversationList={refreshConversationList}
            handleGetMessages={handleGetMessages}
          />
        ))}
      </div>
    </div>
  )
}
export { ChatHistoryList }
