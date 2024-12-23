import { Skeleton } from '@/components/ui/skeleton'
import { useDownload } from '@/hooks/use-download'
import { ModStatus } from '@/types/mods'
import { ModDto } from '@deadlock-mods/utils'
import { CheckIcon, DownloadIcon, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Progress } from './ui/progress'

const ModCard = ({ mod }: { mod?: ModDto }) => {
  const { download, progress, localMod } = useDownload(mod)
  const status = localMod?.status
  const progressPercentage = ((progress?.progressTotal ?? 0) / (progress?.total ?? 1)) * 100

  const Icon = useMemo(() => {
    switch (status) {
      case ModStatus.DOWNLOADING:
        if (!progress) return <Loader2 className="h-4 w-4 animate-spin" />
        return <span className="text-xs">{`${Number(progressPercentage).toFixed(0)}%`}</span>
      case ModStatus.DOWNLOADED:
        return <CheckIcon className="h-4 w-4" />
      case ModStatus.INSTALLED:
        return <CheckIcon className="h-4 w-4" />
      default:
        return <DownloadIcon className="h-4 w-4" />
    }
  }, [status, progress, progressPercentage])

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
              <Button size="icon" variant="outline" disabled>
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
      <div className="relative">
        <img src={mod.images[0]} alt={mod.name} className="h-48 w-full object-cover rounded-t-xl" />
        {status === ModStatus.INSTALLED ? <Badge className="absolute top-2 right-2">Installed</Badge> : null}
      </div>
      <Progress value={progressPercentage} className="h-2" />
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
            <Button
              size="icon"
              variant="outline"
              title="Download Mod"
              onClick={() => download()}
              disabled={status && [ModStatus.DOWNLOADING, ModStatus.DOWNLOADED, ModStatus.INSTALLED].includes(status)}
            >
              {Icon}
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

export default ModCard
