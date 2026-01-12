
export const generateId = () => Math.random().toString(36).substring(2, 15);

export const generateUsername = () => `GHOST-${Math.floor(Math.random() * 90000 + 10000)}`;

export const generateReconnectCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const formatTime = (timestamp: number) => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  }).format(new Date(timestamp));
};

const dayPrompts = [
  "Be honest… what’s something you enjoy but would never admit publicly?",
  "What’s the most ‘Indian secret’ you’re hiding right now?",
  "Kisi cheez ka guilt hai jo roz yaad aata hai?",
  "What’s one habit you defend but know is questionable?",
  "If nobody judged you, what would you talk about openly?",
  "What’s something you’re curious about but scared to try?",
  "What part of your personality only comes out in private?",
  "What’s the biggest lie you’ve told just to keep peace?",
  "What do you crave more: attention or understanding?",
  "What’s your most ‘sharam wali’ thought today?",
  "What’s one fantasy that stays only in your head?",
  "What’s something that excites you but also confuses you?",
  "What’s your honest take on casual relationships?",
  "What do you secretly judge people for?",
  "What’s one thing you’d try once if consequences didn’t exist?",
  "What makes you feel attractive?",
  "What’s the most impulsive thought you had today?",
  "What do you enjoy that society pretends doesn’t exist?",
  "What’s one rule you break quietly?",
  "What’s something you like but pretend not to?",
  "What’s your most controversial opinion about relationships?",
  "What’s one desire you delay every day?",
  "What makes you feel wanted?",
  "What’s your honest opinion about flirting?",
  "What’s something you wish people asked you?",
  "What excites you mentally more than physically?",
  "What do you enjoy more: attention or intimacy?",
  "What’s something you explore only in imagination?",
  "What’s one thing you hide behind jokes?",
  "What do you think people misunderstand about desire?",
  "What makes you feel confident instantly?",
  "What’s something you enjoy but feel guilty about?",
  "What’s your take on emotional cheating?",
  "What’s one boundary you struggle to maintain?",
  "What’s your comfort distraction?",
  "What makes you feel alive during boring days?",
  "What’s your most honest relationship fear?",
  "What’s one thing you’d confess anonymously?",
  "What’s something you enjoy in silence?",
  "What do you crave more right now: touch or conversation?",
  "What’s your relationship with attention?",
  "What do you enjoy but don’t label?",
  "What’s something you secretly want validated?",
  "What excites you more: mystery or clarity?",
  "What do you think about late-night conversations?",
  "What makes a connection feel real to you?",
  "What’s one thought you revisit often?",
  "What do you enjoy without understanding why?",
  "What’s your honest take on desire vs love?",
  "What’s something you wish felt less taboo?"
];

const nightPrompts = [
  "What thought gets louder when the lights are off?",
  "What’s something you’ve never said out loud?",
  "What kind of touch do you miss the most?",
  "What’s your quietest craving?",
  "What do you think about when you can’t sleep?",
  "What part of you feels unseen?",
  "What secret feels heavy tonight?",
  "What do you long for but don’t chase?",
  "What memory feels warm and dangerous at the same time?",
  "What makes nights harder than days?",
  "What desire scares you?",
  "What do you avoid admitting to yourself?",
  "What kind of intimacy do you crave?",
  "What’s your most vulnerable thought right now?",
  "Who do you think about before sleeping?",
  "What emotion do you suppress during the day?",
  "What do you wish someone understood about you?",
  "What feels unfinished in your life?",
  "What’s one thing you want but feel you shouldn’t?",
  "What’s your private weakness?",
  "What do you fantasize about emotionally?",
  "What makes you feel exposed?",
  "What truth feels unsafe to share?",
  "What are you pretending not to miss?",
  "What kind of connection scares you?",
  "What do you replay in your head at night?",
  "What part of you needs reassurance?",
  "What do you crave more at night than day?",
  "What does intimacy mean to you right now?",
  "What desire do you hide behind silence?",
  "What makes you feel replaceable?",
  "What do you avoid feeling?",
  "What kind of closeness do you miss?",
  "What’s something you want to be forgiven for?",
  "What thought makes your chest heavy?",
  "What do you wish someone asked you tonight?",
  "What do you need but won’t ask for?",
  "What emotion do you mask the most?",
  "What do you think about when you’re alone?",
  "What truth feels dangerous to admit?",
  "What kind of attention do you crave?",
  "What makes you feel emotionally naked?",
  "What are you holding back from saying?",
  "What kind of silence feels comforting?",
  "What desire feels confusing?",
  "What do you miss about being close to someone?",
  "What’s your most honest late-night thought?",
  "What part of you feels untouched?",
  "What do you wish felt simpler?",
  "What would you confess if this truly disappeared?"
];

export const getWelcomePrompt = () => {
  const hour = new Date().getHours();
  const isDay = hour >= 6 && hour < 18;
  const pool = isDay ? dayPrompts : nightPrompts;
  return pool[Math.floor(Math.random() * pool.length)];
};
