import programme from './programme-2026.json' with { type: 'json' };

export const voteTypes = [
    { id: 3, name: 'overall', display_name: '综合', max_per_user: 5 },
    { id: 1, name: 'japanese', display_name: '日语', max_per_user: 3 },
    { id: 2, name: 'singing', display_name: '歌唱', max_per_user: 3 },
];

export const { singers, sections, guests } = programme;

const competingHalves = new Set(singers.flatMap(singer => singer.songs.map(song => song.half)));
export const roster = { singers, sections: sections.filter(section => competingHalves.has(section.half)), vote_types: voteTypes };

