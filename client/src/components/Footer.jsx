import { Mail, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-black/20">
      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left - Branding */}
          <div className="flex items-center gap-3 text-white/40 text-sm">
            <span>© {new Date().getFullYear()} SurvivorSZN</span>
            <span className="text-white/20">•</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              Made with <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" /> for NFL fans
            </span>
          </div>
          
          {/* Right - Links */}
          <a 
            href="mailto:jonsung89@gmail.com" 
            className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            <Mail className="w-4 h-4" />
            <span>Support</span>
          </a>
        </div>
      </div>
    </footer>
  );
}