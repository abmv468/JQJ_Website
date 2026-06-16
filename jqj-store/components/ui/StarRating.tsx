import { Star } from "lucide-react";

export default function StarRating({
  rating,
  size = 14,
  className = "",
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i + 1 <= Math.round(rating);
        return (
          <Star
            key={i}
            style={{ width: size, height: size }}
            className={filled ? "fill-brand-gold text-brand-gold" : "text-brand-border"}
          />
        );
      })}
    </div>
  );
}
