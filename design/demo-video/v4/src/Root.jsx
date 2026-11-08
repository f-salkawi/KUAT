import React from 'react'
import { Composition } from 'remotion'
import { END, FPS, Film } from './Film'

export const Root = () => <Composition id="KUAT" component={Film} durationInFrames={Math.ceil(END * FPS)} fps={FPS} width={1920} height={1080} />
