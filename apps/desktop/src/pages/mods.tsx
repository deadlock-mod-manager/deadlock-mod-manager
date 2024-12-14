import ModCard from '@/components/mod-card'
import { getMods } from '@/lib/api'
import { Suspense, useEffect } from 'react'
import { useQuery } from 'react-query'
import { toast } from 'sonner'
const GetModsData = () => {
  const { data, error } = useQuery('mods', getMods, { suspense: true })

  useEffect(() => {
    if (error) toast.error((error as Error)?.message ?? 'Failed to fetch mods. Try again later.')
  }, [error])

  return <div className="grid grid-cols-4 gap-4">{data?.map((mod) => <ModCard key={mod.id} mod={mod} />)}</div>
}

const GetMods = () => {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-4 gap-4 w-full h-full overflow-y-auto">
          {Array.from({ length: 25 }).map((_, index) => (
            <ModCard key={index} mod={undefined} />
          ))}
        </div>
      }
    >
      <GetModsData />
    </Suspense>
  )
}

export default GetMods
