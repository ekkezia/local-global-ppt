# CASE03: midigraph
### Asian Avant-Garde Film Festival at M+ Museum, Hong Kong (2023)
<video controls src="../assets/05-midigraph/1.mov"></video>
- Audio-reactive live visual with DJ (Panic Library)
- Also an **alternative documentation process**:
  - Photography becomes **durational** 🕛🕧🕛🕧
  - Photography becomes **dynamic** 🏃🏻‍♀️🏃🏻‍♀️🏃🏻‍♀️🏃🏻‍♀️
  - Photography is an **active agent** that reacts to the event happening around it ⚡️

## The Question

> How can photography become part of a live system instead of only recording what already happened?

  - Capture the visual input.
  - Capture the sound input.
  - Translate sound into position.
  - Build a live image sequence over time.

## The System

| Component | Role |
| --- | --- |
| Camera feed | Captures the event at the current moment |
| Microphone / sound input | Receives the sound happening at the current moment |
| Processing sketch | Frequency analysis & places the captured frame into the graph |
| Projection / screen | Displays the live documentation back into the event |
| NextJS | The complete final documentation destination

## The Logic

```js
function midiGraph(cameraFeed, soundInput) {
  const capture = cameraFeed.captureCurrentFrame();
  const frequency = soundInput.analyzeCurrentFrequency();

  const x = previousCapture.x + capture.width;
  const y = mapFrequencyToScale(frequency);

  graph.place(capture, x, y);
}
```
