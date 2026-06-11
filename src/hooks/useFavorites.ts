import { useCallback } from "react";
import { useLocalStorage, readLocalStorage } from "./useLocalStorage";
import { FAVORITES_KEY } from "./useSave";

function getInitialFavorites(): string[] {
  const parsed = readLocalStorage<string[]>(FAVORITES_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function useFavorites() {
  const [favorites, setFavorites] = useLocalStorage<string[]>(FAVORITES_KEY, getInitialFavorites);

  const toggleFavorite = useCallback(
    (levelId: string): string[] => {
      let newFavorites: string[];
      setFavorites((prev) => {
        const index = prev.indexOf(levelId);
        if (index >= 0) {
          newFavorites = [...prev.slice(0, index), ...prev.slice(index + 1)];
        } else {
          newFavorites = [...prev, levelId];
        }
        return newFavorites;
      });
      return favorites;
    },
    [favorites, setFavorites]
  );

  const isFavorite = useCallback(
    (levelId: string): boolean => {
      return favorites.includes(levelId);
    },
    [favorites]
  );

  const removeFavorite = useCallback(
    (levelId: string) => {
      setFavorites((prev) => prev.filter((id) => id !== levelId));
    },
    [setFavorites]
  );

  return {
    favorites,
    setFavorites,
    toggleFavorite,
    isFavorite,
    removeFavorite
  };
}
