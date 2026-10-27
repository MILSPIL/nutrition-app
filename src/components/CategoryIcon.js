import React, { useState } from 'react';
import { Utensils } from 'lucide-react';

export default function CategoryIcon({ src, alt }) {
  const [failedSource, setFailedSource] = useState(null);
  if (!src || failedSource === src) {
    return (
      <span role="img" aria-label={alt} className="w-full h-full flex items-center justify-center text-[#8E8E93]">
        <Utensils size={20} aria-hidden="true" />
      </span>
    );
  }
  return <img src={src} alt={alt} onError={() => setFailedSource(src)} className="w-full h-full object-cover" />;
}
