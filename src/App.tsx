import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout, MenuPage } from './components/Layout';
import { QteProvider } from './components/Qte';
import { Spinner } from './components/Modal';
import { useAutoSync, useTheme } from './hooks';
import { Home } from './features/Home';
import { CoursePage } from './features/Course';
import { LessonPage } from './features/Lesson';

const ReviewPage = lazy(() => import('./features/Review').then((m) => ({ default: m.ReviewPage })));
const KanaPage = lazy(() => import('./features/Kana').then((m) => ({ default: m.KanaPage })));
const KanjiPage = lazy(() => import('./features/Kanji').then((m) => ({ default: m.KanjiPage })));
const KanjiDetailPage = lazy(() => import('./features/Kanji').then((m) => ({ default: m.KanjiDetailPage })));
const DictionaryPage = lazy(() => import('./features/Dictionary').then((m) => ({ default: m.DictionaryPage })));
const GrammarPage = lazy(() => import('./features/Grammar').then((m) => ({ default: m.GrammarPage })));
const GrammarTopicPage = lazy(() => import('./features/Grammar').then((m) => ({ default: m.GrammarTopicPage })));
const ReadPage = lazy(() => import('./features/Read').then((m) => ({ default: m.ReadPage })));
const StoryPage = lazy(() => import('./features/Read').then((m) => ({ default: m.StoryPage })));
const SpeakPage = lazy(() => import('./features/Speak').then((m) => ({ default: m.SpeakPage })));
const TalkPage = lazy(() => import('./features/Talk').then((m) => ({ default: m.TalkPage })));
const TalkScenePage = lazy(() => import('./features/Talk').then((m) => ({ default: m.TalkScenePage })));
const WritePage = lazy(() => import('./features/Write').then((m) => ({ default: m.WritePage })));
const CityPage = lazy(() => import('./features/City').then((m) => ({ default: m.CityPage })));
const ExamPage = lazy(() => import('./features/Exam').then((m) => ({ default: m.ExamPage })));
const TutorPage = lazy(() => import('./features/Tutor').then((m) => ({ default: m.TutorPage })));
const DialectsPage = lazy(() => import('./features/Dialects').then((m) => ({ default: m.DialectsPage })));
const SettingsPage = lazy(() => import('./features/Settings').then((m) => ({ default: m.SettingsPage })));
const AboutPage = lazy(() => import('./features/About').then((m) => ({ default: m.AboutPage })));

function Shell() {
  useTheme();
  useAutoSync();
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="course" element={<CoursePage />} />
          <Route path="lesson/:id" element={<LessonPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="kana" element={<KanaPage />} />
          <Route path="kanji" element={<KanjiPage />} />
          <Route path="kanji/:ch" element={<KanjiDetailPage />} />
          <Route path="dict" element={<DictionaryPage />} />
          <Route path="grammar" element={<GrammarPage />} />
          <Route path="grammar/:id" element={<GrammarTopicPage />} />
          <Route path="read" element={<ReadPage />} />
          <Route path="read/:id" element={<StoryPage />} />
          <Route path="speak" element={<SpeakPage />} />
          <Route path="talk" element={<TalkPage />} />
          <Route path="talk/:id" element={<TalkScenePage />} />
          <Route path="write" element={<WritePage />} />
          <Route path="city" element={<CityPage />} />
          <Route path="exam" element={<ExamPage />} />
          <Route path="tutor" element={<TutorPage />} />
          <Route path="dialects" element={<DialectsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <HashRouter>
      <QteProvider>
        <Shell />
      </QteProvider>
    </HashRouter>
  );
}
