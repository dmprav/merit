# Conversation

Displays an ordered thread of person and assistant messages in a labelled log that stays quiet while answers stream and follows the end of a scrolling panel until the person scrolls away.

## Usage

- Wrap turns in `Conversation` with a descriptive `label`; change `followKey` whenever the person asks a new question so the thread follows its end again.
- Use `ConversationMessage` with `author="person"` (right-aligned muted fill) or `author="assistant"` (plain reading-height content that can hold paragraphs, notices, or activity blocks), and supply `authorLabel` for assistive technology.
- Place quiet follow-up commands in `actions` using `ConversationAction`; they stay visible on the latest message and appear on hover or focus for earlier turns.
- Announce completed answers separately with `StatusMessage` rather than turning the log live while text streams.

## Exports

- `Conversation` — props `label`, `followKey?`, `children`
- `ConversationMessage` — props `author` (`"person" | "assistant"`), `authorLabel`, `actions?`, `children`
- `ConversationAction` — props `icon`, `label`, `onPress`
