import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer
      className="text-primary-foreground py-16 md:py-24 relative"
      style={{
        background:
          "linear-gradient(to bottom, hsl(var(--foreground)) 0%, hsl(220 12% 22%) 50%, hsl(var(--foreground)) 100%)",
      }}
    >
      <div className="container mx-auto px-4 md:px-8 relative">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-display text-xl mb-4">Vendora</h3>
            <p className="text-sm opacity-70 leading-relaxed max-w-xs">
              Your event, perfectly composed. From vendors to invitations, everything in one calm platform.
            </p>
          </div>
          <div>
            <p className="font-label mb-4 opacity-50">Platform</p>
            <div className="space-y-3">
              <Link to="/vendors" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">Browse Vendors</Link>
              <Link to="/how-it-works" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">How It Works</Link>
              <Link to="/vendor-apply" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">Become a Vendor</Link>
            </div>
          </div>
          <div>
            <p className="font-label mb-4 opacity-50">Company</p>
            <div className="space-y-3">
              <span className="block text-sm opacity-70">About</span>
              <span className="block text-sm opacity-70">Careers</span>
              <span className="block text-sm opacity-70">Press</span>
            </div>
          </div>
          <div>
            <p className="font-label mb-4 opacity-50">Support</p>
            <div className="space-y-3">
              <span className="block text-sm opacity-70">Help Center</span>
              <span className="block text-sm opacity-70">Contact</span>
              <span className="block text-sm opacity-70">Privacy Policy</span>
            </div>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-primary-foreground/10 text-sm opacity-50">
          © 2026 Vendora. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
