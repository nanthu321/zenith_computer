import React from 'react'
import zenithAvatar from '../../assets/zenith.png'

/**
 * Zenith Bot Icon — Uses the zenith.png asset as the bot avatar
 */
export default function BotIcon({ size = 20 }) {
  return (
    <img
      src={zenithAvatar}
      alt="Zenith"
      width={size}
      height={size}
      style={{
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block',
      }}
      draggable={false}
    />
  )
}
