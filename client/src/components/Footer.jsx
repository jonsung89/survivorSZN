import { Link } from 'react-router-dom';
import { Mail, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-fg/10 bg-fg/[0.03]">
      <div className="max-w-7xl mx-auto px-4 sm:pr-16 md:pr-20 py-5">
        {/* Desktop: single row */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-3 text-fg/50 text-sm">
            <span>© {new Date().getFullYear()} SurvivorSZN</span>
            <span className="text-fg/25">•</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              Made with <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" /> by a fan, for the fans
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/privacy" className="text-fg/50 hover:text-fg/70 transition-colors">Privacy</Link>
            <span className="text-fg/25">•</span>
            <Link to="/terms" className="text-fg/50 hover:text-fg/70 transition-colors">Terms</Link>
            <span className="text-fg/25">•</span>
            <a href="mailto:support@survivorszn.com" className="flex items-center gap-1.5 text-fg/50 hover:text-fg/70 transition-colors">
              <Mail className="w-4 h-4" />
              <span>Support</span>
            </a>
          </div>
        </div>

        {/* Mobile: centered stacked layout */}
        <div className="flex sm:hidden flex-col items-center gap-3 text-sm text-fg/50">
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-fg/70 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-fg/70 transition-colors">Terms</Link>
            <a href="mailto:support@survivorszn.com" className="flex items-center gap-1.5 hover:text-fg/70 transition-colors">
              <Mail className="w-4 h-4" />
              Support
            </a>
          </div>
          <div className="flex items-center gap-1.5">
            <span>© {new Date().getFullYear()} SurvivorSZN</span>
            <span className="text-fg/25">·</span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              Made with <Heart className="w-3 h-3 text-red-400 fill-red-400" /> by a fan, for the fans
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
