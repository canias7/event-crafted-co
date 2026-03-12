import { motion } from "framer-motion";
import { Star, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import vendorPhotographer from "@/assets/vendor-photographer.jpg";
import vendorFlorist from "@/assets/vendor-florist.jpg";
import vendorCatering from "@/assets/vendor-catering.jpg";
import vendorDj from "@/assets/vendor-dj.jpg";
import vendorVenue from "@/assets/vendor-venue.jpg";
import vendorMakeup from "@/assets/vendor-makeup.jpg";

const imageMap: Record<string, string> = {
  "vendor-photographer": vendorPhotographer,
  "vendor-florist": vendorFlorist,
  "vendor-catering": vendorCatering,
  "vendor-dj": vendorDj,
  "vendor-venue": vendorVenue,
  "vendor-makeup": vendorMakeup,
};

interface VendorCardProps {
  vendor: {
    id: string;
    name: string;
    category: string;
    description: string;
    rating: number;
    reviews: number;
    startingPrice: number;
    distance: string;
    availability: string;
    image: string;
  };
  onClick?: () => void;
}

export function VendorCard({ vendor, onClick }: VendorCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", duration: 0.4, bounce: 0 }}
      className="bg-card rounded-2xl p-1 card-shadow cursor-pointer group"
      onClick={onClick}
    >
      <div className="relative overflow-hidden rounded-xl">
        <img
          src={imageMap[vendor.image]}
          alt={vendor.name}
          className="w-full h-56 object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <Badge
          className={`absolute top-3 right-3 ${
            vendor.availability === "available"
              ? "bg-accent text-accent-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          {vendor.availability === "available" ? "Available" : "Limited"}
        </Badge>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-label text-muted-foreground">{vendor.category}</p>
          <div className="flex items-center gap-1 text-sm">
            <Star className="w-3.5 h-3.5 fill-accent text-accent" />
            <span className="font-medium tnum">{vendor.rating}</span>
            <span className="text-muted-foreground tnum">({vendor.reviews})</span>
          </div>
        </div>
        <h3 className="font-display text-lg mb-1">{vendor.name}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-2">
          {vendor.description}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="tnum font-medium text-foreground">
              From ${vendor.startingPrice.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {vendor.distance}
            </span>
          </div>
          <Button size="sm" variant="ghost" className="text-sm">
            View Profile
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
