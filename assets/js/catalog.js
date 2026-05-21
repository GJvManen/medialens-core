export function isDirect(source){return Boolean(source && (source.streamUrl||source.hlsUrl||source.videoUrl||source.embedUrl||source.playerUrl));}
