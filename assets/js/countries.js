export function splitCountries(c){return String(c||"Wereldwijd").split(/\s*\/\s*|,|;| en /i).map(x=>x.trim()).filter(Boolean);}
