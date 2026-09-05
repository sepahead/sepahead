// Applies only to the authored, validated SVG sources. Hiding SMIL elements does
// not stop them: remove the animation instructions and retain base attributes.
export function staticSvg(svg) {
  const still = svg.replace(/<(animate|animateMotion|animateTransform|set)\b[^>]*(?:\/>|>[\s\S]*?<\/\1>)/g, "");
  return still.replace(/<\/svg>\s*$/, `<style>* { animation: none !important; transition: none !important; }</style>\n</svg>\n`);
}
