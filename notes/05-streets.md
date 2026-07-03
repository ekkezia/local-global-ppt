## CASE03: Entering the Photograph

- 3D interaction -> **360° camera**.

## The Question
> Is 360 considered an image when you already capture everything? Why do i rarely see it circulating? How can we photograph and display a 360 image? How can the affordances of 360 image help us create new kind of narratives?

- Take a photograph every few steps within a specific location.
- Render each photograph as a texture inside a sphere.
- Display navigation arrows that move between photographs.
- Combine the sequence with a specific story and cast of characters.

## Breaking It Down
| Programming Concept | Artistic Concept |
| --- | --- |
| Function | The logic that shows navigation arrows to go to the next or previous image |
| Arguments | Individual photographs, navigation config, location latitude/longitude, narrative per image |
| Result | A narrative based on a collection of 360 images taken in a location |

```js
function createStreets(location, story, characters) {
  const photographs = captureEveryFewSteps(location);
  return renderStreetView(photographs, story, characters);
}
```

### Jakarta: Pasar Baru
<video controls src="../assets/06-streets/Jakarta.mov"></video>

- The narrative includes a branching decision.
- The viewer's choice determines whether the main character gets robbed.

### Hong Kong: Jordan Street
<video controls src="../assets/06-streets/HK.mov"></video>

- Two girls meet after chatting through a second-hand buying platform.
- This iteration explores:
  - Two-column navigation.
  - Different points of view.
  - Parallel experiences of the same location.

### Singapore: Vertical Navigation
<video controls src="../assets/06-streets/SG.mov"></video>

- The Singapore iteration moves away from primarily horizontal navigation and responds to the architecture of the location.

### New York City: Recalculating Route
<video controls src="../assets/06-streets/NYC.mov"></video>

*Recalculating Route* - All Streets Gallery
- a tutorial for creating 360° photography.

## One System Across Different Cities

```js
createStreets(jakarta, branchingStory, pasarBaruCharacters);
createStreets(hongKong, parallelStory, jordanStreetCharacters);
createStreets(singapore, verticalStory, elevatorCharacters);
createStreets(newYork, circularStory, allStreetCharacters);
```
