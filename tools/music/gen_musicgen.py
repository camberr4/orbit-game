import sys, time, torch, numpy as np, soundfile as sf
from transformers import AutoProcessor, MusicgenForConditionalGeneration
name, secs, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
prompt = sys.argv[4]
torch.set_num_threads(4)
proc = AutoProcessor.from_pretrained(name); model = MusicgenForConditionalGeneration.from_pretrained(name)
inp = proc(text=[prompt], padding=True, return_tensors='pt')
t = time.time()
with torch.no_grad(): audio = model.generate(**inp, do_sample=True, guidance_scale=3.0, max_new_tokens=int(secs * 50))
sr = model.config.audio_encoder.sampling_rate
x = audio[0].numpy().T
sf.write(out, x, sr); print('done', x.shape, sr, round(time.time() - t, 1), 's')
