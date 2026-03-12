import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Send } from "lucide-react";

const categories = ["Photographer", "Videographer", "Catering", "DJ", "Florist", "Event Planner", "Decorator", "Makeup Artist", "Baker", "Venue"];

export default function VendorApplyPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <div className="pt-28 pb-16">
        <div className="container mx-auto px-4 md:px-8 max-w-2xl">
          <div className="text-center mb-12">
            <p className="font-label text-accent mb-3">Become a Vendor</p>
            <h1 className="text-h2 font-display mb-3">Join our marketplace</h1>
            <p className="text-muted-foreground">Apply to become a verified vendor on Élevé. Our team reviews every application to ensure quality.</p>
          </div>

          <div className="bg-card rounded-2xl card-shadow p-6 md:p-8 space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Business Name *</label>
                <Input className="h-11 rounded-lg bg-secondary border-none" placeholder="Your business name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Owner Name *</label>
                <Input className="h-11 rounded-lg bg-secondary border-none" placeholder="Full name" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Category *</label>
                <Select>
                  <SelectTrigger className="h-11 rounded-lg bg-secondary border-none">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Years of Experience *</label>
                <Input type="number" className="h-11 rounded-lg bg-secondary border-none" placeholder="e.g. 5" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Email *</label>
                <Input type="email" className="h-11 rounded-lg bg-secondary border-none" placeholder="business@email.com" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Phone *</label>
                <Input type="tel" className="h-11 rounded-lg bg-secondary border-none" placeholder="(555) 123-4567" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Service Area *</label>
              <Input className="h-11 rounded-lg bg-secondary border-none" placeholder="e.g. New York City, Brooklyn, Manhattan" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Description *</label>
              <Textarea className="rounded-lg bg-secondary border-none min-h-24" placeholder="Tell us about your business, services, and what makes you unique..." />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Starting Price</label>
              <Input className="h-11 rounded-lg bg-secondary border-none" placeholder="e.g. $1,500" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Portfolio Images</label>
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-1">Drag and drop images or click to browse</p>
                <p className="text-xs text-muted-foreground/60">JPG, PNG up to 10MB each · Max 10 images</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Website / Social Media</label>
              <Input className="h-11 rounded-lg bg-secondary border-none" placeholder="https://your-website.com" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Documents (optional)</label>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                <p className="text-sm text-muted-foreground">Upload business license, insurance, or certifications</p>
              </div>
            </div>

            <Button className="w-full h-11 rounded-lg" size="lg">
              <Send className="w-4 h-4 mr-2" />
              Submit Application
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Applications are typically reviewed within 2-3 business days. You'll receive an email once reviewed.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
