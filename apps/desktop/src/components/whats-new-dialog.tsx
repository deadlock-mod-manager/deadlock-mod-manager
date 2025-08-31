import { ArrowSquareOut, Sparkle } from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-shell';
import useAbout from '@/hooks/use-about';
import { APP_NAME, GITHUB_REPO } from '@/lib/constants';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

type WhatsNewDialogProps = {
  onClose: () => void;
};

export const WhatsNewDialog = ({ onClose }: WhatsNewDialogProps) => {
  const { data } = useAbout();
  if (!data) {
    return null;
  }

  const { version } = data;

  const updateContent = {
    '0.5.0': {
      title: 'Stability & New Features',
      features: [
        '🛡️ Fixed Windows crash issue with single-instance plugin',
        '✨ Added this "What\'s New" dialog to showcase updates',
        '⚠️ New outdated mod warning system for better mod management',
        '🎮 Updated champion roster with latest Deadlock heroes',
        '🔧 Fixed Custom Launch Options not respecting enabled/disabled status',
        '🎨 Enhanced UI components and layout improvements',
        '🔧 Various stability improvements and bug fixes',
      ],
    },
    '0.4.0': {
      title: 'Better Download Management & UI Refresh',
      features: [
        '✨ Refreshed user interface with improved navigation',
        '📥 Enhanced download management system',
        '🐛 Fixed mod deletion issues (thanks @Skeptic-systems)',
        '🔧 Better error handling and user feedback',
      ],
    },
    '0.3.0': {
      title: 'UI Refactor & Download Improvements',
      features: [
        '🎨 Complete UI overhaul for better user experience',
        '📦 Improved download management',
        '⚡ Performance optimizations',
        '🔄 Updated core dependencies',
      ],
    },
    '0.2.0': {
      title: 'Error Tracking & Permissions Fix',
      features: [
        '📊 Added Sentry issue tracking for better bug reports',
        '🔐 Fixed updater permissions issues',
        '🛡️ Enhanced error reporting and diagnostics',
      ],
    },
  };

  const currentUpdate = updateContent[version as keyof typeof updateContent];

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Sparkle className="h-5 w-5 text-primary" />
          <DialogTitle>What's New</DialogTitle>
          <Badge variant="secondary">v{version}</Badge>
        </div>
        <DialogDescription>
          Welcome to the latest version of {APP_NAME}!
        </DialogDescription>
      </DialogHeader>

      {currentUpdate && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold text-foreground text-sm">
              {currentUpdate.title}
            </h3>
            <ul className="space-y-2 text-muted-foreground text-sm">
              {currentUpdate.features.map((feature, index) => (
                <li className="flex items-start gap-2" key={index}>
                  <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <DialogFooter className="flex flex-row items-center justify-between">
        <Button
          className="gap-2"
          onClick={() => open(`${GITHUB_REPO}/releases/tag/v${version}`)}
          size="sm"
          variant="outline"
        >
          <ArrowSquareOut className="h-4 w-4" />
          Full Release Notes
        </Button>
        <Button onClick={onClose} size="sm">
          Got it!
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};
