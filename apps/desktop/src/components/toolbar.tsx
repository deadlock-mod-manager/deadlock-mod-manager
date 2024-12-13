import { GameController, Play } from '@phosphor-icons/react'
import { Button } from './ui/button'

export const Toolbar = () => {
  return (
    <div className="flex flex-row items-center justify-end w-full gap-4 py-4 px-8 border-b">
      <Button size="lg" variant="ghost">
        <Play />
        <span className="font-medium text-md">Launch Vanilla</span>
      </Button>
      <Button size="lg">
        <GameController />
        <span className="font-medium text-md">Launch Modded</span>
      </Button>
    </div>
  )
}
