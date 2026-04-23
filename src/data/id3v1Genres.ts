// MSP 2.0 - ID3v1 Genres
// Canonical list of genres from the ID3v1 tag specification (0-79) plus the
// Winamp extension (80-125) and Winamp 5.6+ extension (126-147).
// Source: https://en.wikipedia.org/wiki/List_of_ID3v1_genres
//
// Surfaced as autocomplete suggestions on the comma-separated keywords input.
// Kept in ID3v1 index order so the list is easy to diff against the spec.
// Index 133 ("Negerpunk") is intentionally omitted — it is a racial slur, and
// we do not need to preserve numeric index stability for a UI suggestion list.

export const ID3V1_GENRES: readonly string[] = [
  'Blues',                  // 0
  'Classic Rock',           // 1
  'Country',                // 2
  'Dance',                  // 3
  'Disco',                  // 4
  'Funk',                   // 5
  'Grunge',                 // 6
  'Hip-Hop',                // 7
  'Jazz',                   // 8
  'Metal',                  // 9
  'New Age',                // 10
  'Oldies',                 // 11
  'Other',                  // 12
  'Pop',                    // 13
  'Rhythm and Blues',       // 14
  'Rap',                    // 15
  'Reggae',                 // 16
  'Rock',                   // 17
  'Techno',                 // 18
  'Industrial',             // 19
  'Alternative',            // 20
  'Ska',                    // 21
  'Death Metal',            // 22
  'Pranks',                 // 23
  'Soundtrack',             // 24
  'Euro-Techno',            // 25
  'Ambient',                // 26
  'Trip-Hop',               // 27
  'Vocal',                  // 28
  'Jazz & Funk',            // 29
  'Fusion',                 // 30
  'Trance',                 // 31
  'Classical',              // 32
  'Instrumental',           // 33
  'Acid',                   // 34
  'House',                  // 35
  'Game',                   // 36
  'Sound Clip',             // 37
  'Gospel',                 // 38
  'Noise',                  // 39
  'Alternative Rock',       // 40
  'Bass',                   // 41
  'Soul',                   // 42
  'Punk',                   // 43
  'Space',                  // 44
  'Meditative',             // 45
  'Instrumental Pop',       // 46
  'Instrumental Rock',      // 47
  'Ethnic',                 // 48
  'Gothic',                 // 49
  'Darkwave',               // 50
  'Techno-Industrial',      // 51
  'Electronic',             // 52
  'Pop-Folk',               // 53
  'Eurodance',              // 54
  'Dream',                  // 55
  'Southern Rock',          // 56
  'Comedy',                 // 57
  'Cult',                   // 58
  'Gangsta',                // 59
  'Top 40',                 // 60
  'Christian Rap',          // 61
  'Pop/Funk',               // 62
  'Jungle music',           // 63
  'Native US',              // 64
  'Cabaret',                // 65
  'New Wave',               // 66
  'Psychedelic',            // 67
  'Rave',                   // 68
  'Showtunes',              // 69
  'Trailer',                // 70
  'Lo-Fi',                  // 71
  'Tribal',                 // 72
  'Acid Punk',              // 73
  'Acid Jazz',              // 74
  'Polka',                  // 75
  'Retro',                  // 76
  'Musical',                // 77
  "Rock 'n' Roll",          // 78
  'Hard Rock',              // 79
  // Winamp extension (80-125)
  'Folk',                   // 80
  'Folk-Rock',              // 81
  'National Folk',          // 82
  'Swing',                  // 83
  'Fast Fusion',            // 84
  'Bebop',                  // 85
  'Latin',                  // 86
  'Revival',                // 87
  'Celtic',                 // 88
  'Bluegrass',              // 89
  'Avantgarde',             // 90
  'Gothic Rock',            // 91
  'Progressive Rock',       // 92
  'Psychedelic Rock',       // 93
  'Symphonic Rock',         // 94
  'Slow Rock',              // 95
  'Big Band',               // 96
  'Chorus',                 // 97
  'Easy Listening',         // 98
  'Acoustic',               // 99
  'Humour',                 // 100
  'Speech',                 // 101
  'Chanson',                // 102
  'Opera',                  // 103
  'Chamber Music',          // 104
  'Sonata',                 // 105
  'Symphony',               // 106
  'Booty Bass',             // 107
  'Primus',                 // 108
  'Porn Groove',            // 109
  'Satire',                 // 110
  'Slow Jam',               // 111
  'Club',                   // 112
  'Tango',                  // 113
  'Samba',                  // 114
  'Folklore',               // 115
  'Ballad',                 // 116
  'Power Ballad',           // 117
  'Rhythmic Soul',          // 118
  'Freestyle',              // 119
  'Duet',                   // 120
  'Punk Rock',              // 121
  'Drum Solo',              // 122
  'A cappella',             // 123
  'Euro-House',             // 124
  'Dance Hall',             // 125
  // Winamp 5.6+ extension (126-147)
  'Goa music',              // 126
  'Drum & Bass',            // 127
  'Club-House',             // 128
  'Hardcore Techno',        // 129
  'Terror',                 // 130
  'Indie',                  // 131
  'BritPop',                // 132
  // 133 intentionally omitted
  'Polsk Punk',             // 134
  'Beat',                   // 135
  'Christian Gangsta Rap',  // 136
  'Heavy Metal',            // 137
  'Black Metal',            // 138
  'Crossover',              // 139
  'Contemporary Christian', // 140
  'Christian Rock',         // 141
  'Merengue',               // 142
  'Salsa',                  // 143
  'Thrash Metal',           // 144
  'Anime',                  // 145
  'Jpop',                   // 146
  'Synthpop',               // 147
];
