import { Warning } from '@phosphor-icons/react'
import { FallbackProps, ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'

const fallbackRender = ({ error, resetErrorBoundary }: FallbackProps) => {
  return (
    <Alert>
      <Warning className="h-6 w-6" />
      <AlertDescription className="flex flex-row gap-2 items-center justify-between flex-grow">
        <div className="flex flex-col gap-2">
          <p>We're sorry, but an error occurred while processing your request.</p>
          <pre>Error code: {error.message}</pre>
        </div>
        <div className="flex flex-col items-center gap-2 justify-center">
          <Button onClick={resetErrorBoundary}>Try again</Button>
          <Button variant="ghost" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return <ReactErrorBoundary fallbackRender={fallbackRender}>{children}</ReactErrorBoundary>
}

export default ErrorBoundary
