const personaStyles: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  'The Architect': {
    bg: 'bg-purple-500/15',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '\u{1f3d7}',
  },
  'The Guardian': {
    bg: 'bg-blue-500/15',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    icon: '\u{1f6e1}',
  },
  'The Closer': {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: '\u{1f3af}',
  },
  'The Machine': {
    bg: 'bg-orange-500/15',
    text: 'text-orange-300',
    border: 'border-orange-500/30',
    icon: '\u{2699}',
  },
  'The Polymath': {
    bg: 'bg-pink-500/15',
    text: 'text-pink-300',
    border: 'border-pink-500/30',
    icon: '\u{1f9e0}',
  },
};

const defaultStyle = {
  bg: 'bg-zinc-500/15',
  text: 'text-zinc-300',
  border: 'border-zinc-500/30',
  icon: '\u{2b50}',
};

interface PersonaTagProps {
  persona: string;
}

export default function PersonaTag({ persona }: PersonaTagProps) {
  const style = personaStyles[persona] || defaultStyle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase ${style.bg} ${style.text} ${style.border}`}
    >
      <span className="text-[10px]">{style.icon}</span>
      {persona.replace('The ', '')}
    </span>
  );
}
