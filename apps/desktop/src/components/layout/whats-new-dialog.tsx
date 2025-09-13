import { ArrowSquareOut, Sparkle } from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import useAbout from '@/hooks/use-about';
import { APP_NAME, GITHUB_REPO } from '@/lib/constants';

type WhatsNewDialogProps = {
  onClose: () => void;
};

export const WhatsNewDialog = ({ onClose }: WhatsNewDialogProps) => {
  const { data } = useAbout();

  // Use a fallback version if data is not yet available
  const version = data?.version || '0.7.0';

  const updateContent = {
    '0.7.0': {
      title: 'Major Features & UI Refresh',
      features: [
        '📦 Multi-file download support - choose which files to install when mods have multiple archives',
        '🔒 NSFW content filtering with user controls for safe browsing',
        '⚙️ Advanced gameinfo.gi management for better mod compatibility',
        '🎨 Brand new logo design and enhanced UI styling throughout the app',
        '🚀 Improved launch button animations and enhanced settings layout',
        '📍 Smart scroll position management - keep your scroll position while browsing mods',
        '🔍 Enhanced search relevance and sorting capabilities for better mod discovery',
      ],
    },
    '0.6.1': {
      title: 'Deep Links & Improvements',
      features: ['🔗 Added support for 1-click install links on GameBanana'],
    },
    '0.6.0': {
      title: 'Audio Mod Support & Launch Options',
      features: [
        '🎵 Added support for audio mods - customize your Deadlock sounds',
        '🚀 Improved launch options handling - no longer assumes "+" prefix requirement',
        '🔧 Enhanced mod compatibility and installation process',
        '⚡ Various performance optimizations and stability improvements',
      ],
    },
    '0.5.1': {
      title: 'Performance & Bug Fixes',
      features: [
        '🚀 Added virtualization to mods page for significantly better performance',
        '🔧 Fixed "last updated" sort option not reflecting actual mod timestamps',
        '🏷️ Added category and hero filters for better mod discovery',
        '❌ Added clear button to search input for quick search reset',
        '🔍 Improved filtering and searching functionality on the mods page',
        '🐳 Resolved Docker compatibility issues',
        '🎨 Enhanced mod card layout and styling',
        '📖 Updated UI to acknowledge GameBanana as data source',
        '⚡ Various performance optimizations and stability improvements',
      ],
    },
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
                <li
                  className="flex items-start gap-2"
                  key={`feature-${index}-${feature.slice(0, 10)}`}
                >
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
