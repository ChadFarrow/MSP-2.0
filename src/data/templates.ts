// MSP 2.0 - Pre-built Templates
import type { Album } from '../types/feed';
import { createEmptyAlbum, createEmptyTrack } from '../types/feed';

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  create: () => Album;
}

// Single template (1-2 tracks)
const createSingleTemplate = (): Album => {
  const album = createEmptyAlbum();
  album.title = 'My Single';
  album.author = 'Artist Name';
  album.description = 'A new single release.';
  album.medium = 'music';
  album.categories = ['Music'];
  album.podcastGuid = crypto.randomUUID();

  // Add one track
  const track1 = createEmptyTrack(1);
  track1.title = 'Track Title';
  track1.duration = '00:03:30';
  album.tracks = [track1];

  // Add default value recipient placeholder
  album.value.recipients = [
    {
      name: 'Artist Name',
      address: '',
      split: 100,
      type: 'node'
    }
  ];

  return album;
};

// EP template (4-6 tracks)
const createEPTemplate = (): Album => {
  const album = createEmptyAlbum();
  album.title = 'My EP';
  album.author = 'Artist Name';
  album.description = 'A new EP release with 5 tracks.';
  album.medium = 'music';
  album.categories = ['Music'];
  album.podcastGuid = crypto.randomUUID();

  // Add 5 tracks
  album.tracks = Array.from({ length: 5 }, (_, i) => {
    const track = createEmptyTrack(i + 1);
    track.title = `Track ${i + 1}`;
    track.duration = '00:03:30';
    return track;
  });

  // Add default value recipient placeholder
  album.value.recipients = [
    {
      name: 'Artist Name',
      address: '',
      split: 100,
      type: 'node'
    }
  ];

  return album;
};

// Full Album template (10-12 tracks)
const createAlbumTemplate = (): Album => {
  const album = createEmptyAlbum();
  album.title = 'My Album';
  album.author = 'Artist Name';
  album.description = 'A full-length album release with 10 tracks.';
  album.medium = 'music';
  album.categories = ['Music'];
  album.podcastGuid = crypto.randomUUID();

  // Add 10 tracks
  album.tracks = Array.from({ length: 10 }, (_, i) => {
    const track = createEmptyTrack(i + 1);
    track.title = `Track ${i + 1}`;
    track.duration = '00:04:00';
    return track;
  });

  // Add default value recipients (band split)
  album.value.recipients = [
    {
      name: 'Lead Artist',
      address: '',
      split: 50,
      type: 'node'
    },
    {
      name: 'Band Member 2',
      address: '',
      split: 25,
      type: 'node'
    },
    {
      name: 'Band Member 3',
      address: '',
      split: 25,
      type: 'node'
    }
  ];

  // Add default persons
  album.persons = [
    {
      name: 'Artist Name',
      href: '',
      img: '',
      group: 'music',
      role: 'band'
    }
  ];

  return album;
};

// Blank template
const createBlankTemplate = (): Album => {
  return createEmptyAlbum();
};

// Export all templates
export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from scratch with an empty form',
    icon: '📄',
    create: createBlankTemplate
  },
  {
    id: 'single',
    name: 'Single',
    description: '1-2 tracks, perfect for a single release',
    icon: '💿',
    create: createSingleTemplate
  },
  {
    id: 'ep',
    name: 'EP',
    description: '5 tracks, ideal for an EP release',
    icon: '📀',
    create: createEPTemplate
  },
  {
    id: 'album',
    name: 'Full Album',
    description: '10 tracks with band member splits',
    icon: '💽',
    create: createAlbumTemplate
  }
];
