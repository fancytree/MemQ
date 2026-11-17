import AVFoundation
import ExpoModulesCore

/**
 How loud the phone is set — the hardware volume, not the volume of anything we
 are playing.

 This exists because react-native-volume-manager, the obvious off-the-shelf
 answer, cannot read it. Its `getVolume` returns the `value` of a `UISlider`
 lifted out of an `MPVolumeView` that is never added to a window; an MPVolumeView
 only syncs its slider to the system once it is in a live view hierarchy, so the
 slider sits at its initial 0 and the library reports silence on a phone at full
 volume. That is 2.2.0, the current release, so there was no version to move to.

 Its volume listener works — it is a real KVO on the audio session — but it takes
 the session over to do it: `setCategory(.ambient, options: .mixWithOthers)` and
 `setActive(true)`. Ambient is the category that the ring/silent switch silences,
 so subscribing to volume changes quietly undid lib/speech's whole reason for
 setting `playsInSilentMode`. Reading the session we already have takes a dozen
 lines and touches nothing.

 `outputVolume` reads 0 on a session that has never been activated, which is the
 same number as a phone turned right down — so the session is activated before it
 is read. The app only asks just after a word has been spoken through that very
 session, so this is almost always already true and the call is a no-op; it is
 the "almost" that matters. Without it the first reading of a run can be taken
 while the session is still coming up, and the honest answer "half volume" comes
 back as "silent", which is exactly the wrong way round for what it is used for.

 Activating is safe here for the same reason: the category and options are
 whatever expo-audio has set for the speech that just played, and this does not
 change them. A failure is ignored — the reading is then whatever the session can
 give, and lib/speech treats anything it cannot trust as unknown.
 */
public class OutputVolumeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OutputVolume")

    AsyncFunction("get") { () -> Float in
      let session = AVAudioSession.sharedInstance()
      try? session.setActive(true)
      return session.outputVolume
    }
  }
}
