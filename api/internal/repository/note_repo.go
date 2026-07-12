package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type NoteRepo struct {
	db *pgxpool.Pool
}

func NewNoteRepo(db *pgxpool.Pool) *NoteRepo {
	return &NoteRepo{db: db}
}

func (r *NoteRepo) Create(ctx context.Context, note *model.RunNote) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO run_notes (id, run_id, author, text, created_at) VALUES ($1, $2, $3, $4, $5)`,
		note.ID, note.RunID, note.Author, note.Text, note.CreatedAt,
	)
	return err
}

func (r *NoteRepo) ListByRunID(ctx context.Context, runID string) ([]model.RunNote, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, run_id, author, text, created_at FROM run_notes WHERE run_id = $1 ORDER BY created_at DESC`,
		runID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []model.RunNote
	for rows.Next() {
		var n model.RunNote
		if err := rows.Scan(&n.ID, &n.RunID, &n.Author, &n.Text, &n.CreatedAt); err != nil {
			return nil, err
		}
		notes = append(notes, n)
	}
	return notes, nil
}

func (r *NoteRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM run_notes WHERE id = $1`, id)
	return err
}
