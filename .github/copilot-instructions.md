# GitHub Copilot Instructions

## General coding principles
- Always write clean, readable, and maintainable code
- Prefer composition over large monolithic components
- Keep files short and focused (ideally under 200 lines)
- Avoid deeply nested JSX and logic
- Prefer explicit code over clever code

---

## React / React Native components
- Do NOT generate large components
- If a component grows:
  - Split it into smaller subcomponents
  - Extract logic into custom hooks
- Follow this structure:
  - imports
  - hooks
  - handlers
  - render
- Use functional components only
- Always use hooks, never class components
- Prefer early returns for loading / error states

---

## State management
- Use Redux Toolkit for global state
- Use useSelector and useDispatch instead of passing props deeply
- Local UI state (inputs, modals) should stay in useState
- Avoid putting derived data in Redux; compute it with selectors
- Prefer createAsyncThunk for async logic
- Never mutate state outside reducers

---

## Custom hooks
- Extract reusable logic into custom hooks
- Hooks should:
  - Do one thing
  - Have a clear name (useAuth, useGroup, usePlayerStats)
- Hooks should not contain UI
- Hooks should be testable and reusable

---

## Firebase usage
- Keep Firebase logic outside components
- Use services/ or firebase/ folders for low-level SDK access
- Use endpoints/ or repositories/ for domain logic
- Never call Firestore directly inside JSX
- Always handle loading and error states

---

## Navigation
- Use React Navigation
- Keep navigation logic centralized
- Do not navigate inside reducers
- Prefer helper functions for complex navigation flows

---

## Styling
- Prefer StyleSheet.create (React Native)
- Avoid inline styles unless trivial
- Use consistent spacing and naming
- Keep styles close to the component but separate from logic

---

## Naming conventions
- Components: PascalCase
- Hooks: useSomething
- Variables and functions: camelCase
- Redux slices: somethingSlice
- Async actions: verbNoun (fetchGroups, createMatch)

---

## Comments and documentation
- Add meaningful comments
- Explain why, not what
- Comment complex logic and edge cases
- Avoid obvious comments

---

## Error handling
- Always handle errors explicitly
- Prefer user-friendly error messages
- Never swallow errors silently
- Log errors with context when needed

---

## Testing mindset
- Write code that is easy to test
- Avoid hidden side effects
- Prefer pure functions when possible

---

## Code generation preferences
- Prefer clarity over brevity
- Avoid overengineering
- Do not introduce unnecessary libraries
- Follow existing project patterns

---

## Commit messages
- Use imperative tense
- Describe what changed and why
- Examples:
  - Add group-based player separation
  - Fix profile loading when drawer opens
  - Refactor match stats to support multi-group

---

## Special instructions
- Always write code and comments in English
- Always write text labels in Spanish (UI)
- Assume the project uses:
  - React / React Native
  - Redux Toolkit
  - Firebase
- Avoid Expo-specific APIs unless explicitly requested
