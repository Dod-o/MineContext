import React from 'react'
import { Tooltip, Image } from '@arco-design/web-react'
import { pathToFileURL } from '@renderer/utils/file'

export interface RecordingStats {
  processed_screenshots: number
  failed_screenshots: number
  generated_activities: number
  next_activity_eta_seconds: number
  last_activity_time?: string | null
  session_start_time?: string
  token_usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    models: Record<
      string,
      {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
    >
  }
  recent_errors: Array<{
    error_message: string
    processor_name: string
    timestamp: string
  }>
  recent_screenshots: string[]
}

interface RecordingStatsCardProps {
  stats: RecordingStats | null
}

const formatTokens = (tokens: number) => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 1 : 2)}M`
  }

  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(tokens >= 100_000 ? 0 : 1)}K`
  }

  return `${tokens}`
}

const formatEta = (seconds: number) => {
  if (seconds <= 0) return 'soon'
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

const RecordingStatsCard: React.FC<RecordingStatsCardProps> = ({ stats }) => {
  console.log('[RecordingStatsCard] Rendering with stats:', stats)

  if (!stats) {
    console.log('[RecordingStatsCard] Stats is null, not rendering')
    return null
  }

  console.log('[RecordingStatsCard] Using stats:', stats)

  const totalTokens = stats.token_usage?.total_tokens || 0
  const tokenModels = Object.entries(stats.token_usage?.models || {})

  return (
    <div className="mt-2">
      {/* Recent screenshots display */}
      {stats.recent_screenshots && stats.recent_screenshots.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          <Image.PreviewGroup infinite={false} className="[&_.arco-image-preview-img]:!scale-80">
            {stats.recent_screenshots.map((path, index) => (
              <Image
                key={index}
                src={pathToFileURL(path)}
                width={110}
                height={60}
                alt={`screenshot-${index + 1}`}
                className="cursor-pointer rounded-[8px] overflow-hidden"
              />
            ))}
          </Image.PreviewGroup>
        </div>
      )}

      {/* Stats text */}
      <div className="text-xs text-[#86909C] flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          <span className="text-[#00B42A] font-medium">{stats.processed_screenshots}</span>
          <span> screenshot{stats.processed_screenshots !== 1 ? 's' : ''} processed</span>
        </span>
        <span>•</span>
        <span>
          <span className="font-medium text-[#42464E]">{stats.generated_activities}</span>
          <span> activit{stats.generated_activities === 1 ? 'y' : 'ies'} generated</span>
        </span>
        <span>•</span>
        <span>Next activity in {formatEta(stats.next_activity_eta_seconds)}</span>
        {totalTokens > 0 && (
          <>
            <span>•</span>
            <Tooltip
              content={
                <div className="max-w-xs">
                  <div className="font-medium mb-1">Session Token Usage</div>
                  <div className="text-xs">
                    Prompt {formatTokens(stats.token_usage?.prompt_tokens || 0)}, completion{' '}
                    {formatTokens(stats.token_usage?.completion_tokens || 0)}
                  </div>
                  {tokenModels.length > 0 && (
                    <ul className="text-xs space-y-1 mt-1">
                      {tokenModels.map(([model, usage]) => (
                        <li key={model} className="break-words">
                          {model}: {formatTokens(usage.total_tokens)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              }>
              <span className="text-[#165DFF] font-medium cursor-help underline decoration-dashed">
                {formatTokens(totalTokens)} tokens used
              </span>
            </Tooltip>
          </>
        )}
        {stats.failed_screenshots > 0 && (
          <>
            <span>•</span>
            <Tooltip
              content={
                <div className="max-w-xs">
                  <div className="font-medium mb-1">Recent Errors:</div>
                  {stats.recent_errors.length > 0 ? (
                    <ul className="text-xs space-y-1">
                      {stats.recent_errors.map((error, index) => (
                        <li key={index} className="break-words">
                          {error.error_message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs">No detailed error information available</span>
                  )}
                </div>
              }>
              <span className="text-[#FF4D4F] font-medium cursor-help underline decoration-dashed">
                {stats.failed_screenshots} screenshot{stats.failed_screenshots > 1 ? 's' : ''} failed
              </span>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  )
}

export default RecordingStatsCard
