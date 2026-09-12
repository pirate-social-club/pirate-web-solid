The song fixture is a 16-second generated pink-noise track, created for this
test without a recording from any person. It is mono 44.1 kHz MP3 at 128 kbps,
encoded with ffmpeg/libmp3lame from the lavfi `anoisesrc=color=pink` source at
0.6 amplitude and has no embedded song metadata.

The previous version was a generated sine melody. ACRCloud falsely matched it
to a commercial recording ("La Dolce Ciliegia", score 31) on the 2026-09-12
local journey, which put the submission into `reference_required` and blocked
publication because a fresh local database has no published upstream song to
bind. Toneless noise has no melodic fingerprint for the identification
provider to retain, so an original declaration can reach the allow decision.
The fixture remains real decodable audio; it does not imply any provider
accepted it.
