"""The song table used by arrange_scan.py: stem file names, tempo and a known bar line of each Suno song."""
R='/home/user/orbit-game/assets/music'
# song: (dir, {drums files}, other energy files, bpm, anchor downbeat (a known bar line, seconds, original timeline))
SONGS={
 'aurora_a':('aurora_a',['0 Drums','3 Percussion'],['1 Bass','2 Keyboard','4 Synth','5 Other'],118.99,32.442),
 'aurora_b':('aurora_b',['0 Drums','3 Percussion'],['1 Bass','2 Keyboard','4 Synth','5 Other'],118.99,52.545),
 'dust_a':('dust_a',['0 Drums','4 Percussion'],['1 Bass','3 Keyboard','5 Synth','6 Other'],112.997,55.282),
 'dust_b':('dust_b',['0 Drums'],['1 Bass','3 Keyboard','4 Synth','5 Other'],112.005,55.764),
 'ember':('ember',['drums','percussion'],['bass','keyboard','synth','other'],118.0,77.407),
 'ember_b':('ember_b',['drums','percussion'],['bass','keyboard','synth','other'],121.0,111.25),
 'glacier_a':('glacier_a',['1 Drums','5 Percussion'],['2 Bass','4 Keyboard','7 Synth','8 Other'],114.0,84.37),
 'glacier_b':('glacier_b',['2 Drums','5 Percussion'],['3 Bass','4 Keyboard','7 Synth','8 Other'],113.0,102.13),
 'pulsar_a':('pulsar_a',['1 Drums','4 Percussion'],['2 Bass','3 Keyboard','5 Synth','6 Other'],132.0,36.075),
 'pulsar_b':('pulsar_b',['1 Drums','4 Percussion'],['2 Bass','3 Keyboard','5 Synth','6 Other'],131.0,32.576),
 'void_a':('void_a',['2 Drums','6 Percussion'],['3 Bass','5 Keyboard','8 Synth','9 Other'],128.0,0.042),
 'void_b':('void_b',['1 Drums','5 Percussion'],['2 Bass','4 Keyboard','7 Synth','8 Other'],127.0,0.242),
 'blackhole_a':('blackhole_a',['1 Drums','5 Percussion'],['2 Bass','4 Keyboard','7 Synth','8 Other'],136.0,0.483),
}
