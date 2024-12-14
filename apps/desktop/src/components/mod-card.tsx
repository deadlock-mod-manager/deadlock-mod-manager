import { Skeleton } from '@/components/ui/skeleton'
import { ModDto } from '@deadlock-mods/utils'
import { DownloadIcon } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card'

const ModCard = ({ mod }: { mod?: ModDto }) => {
  if (!mod) {
    return (
      <Card className="shadow cursor-pointer">
        <Skeleton className="h-48 w-full object-cover rounded-t-xl bg-muted" />
        <CardHeader className="px-2 py-3">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <CardTitle>
                <Skeleton className="h-4 w-32" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-32" />
              </CardDescription>
            </div>
            <div className="flex flex-col">
              <Button size="icon" variant="outline">
                <DownloadIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="shadow cursor-pointer">
      <img src={mod.images[0]} alt={mod.name} className="h-48 w-full object-cover rounded-t-xl" />
      <CardHeader className="px-2 py-3">
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <CardTitle className="text-ellipsis w-36 overflow-clip text-nowrap" title={mod.name}>
              {mod.name}
            </CardTitle>
            <CardDescription className="text-ellipsis w-36 overflow-clip text-nowrap" title={mod.author}>
              By {mod.author}
            </CardDescription>
          </div>
          <div className="flex flex-col">
            <Button size="icon" variant="outline" title="Download Mod">
              <DownloadIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

export default ModCard
