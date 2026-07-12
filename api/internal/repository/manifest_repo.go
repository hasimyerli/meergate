package repository

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ManifestRow struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Suite       string `json:"suite"`
	Tags        string `json:"tags"`
	Version     int    `json:"version"`
	Owner       string `json:"owner"`
	YAMLContent string `json:"yaml_content"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type TemplateRow struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	YAMLContent string `json:"yaml_content"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type ManifestRepo struct {
	db *pgxpool.Pool
}

func NewManifestRepo(db *pgxpool.Pool) *ManifestRepo {
	return &ManifestRepo{db: db}
}

func (r *ManifestRepo) Upsert(ctx context.Context, id, name, suite string, tags []string, version int, owner, yamlContent string) error {
	tagsJSON, _ := json.Marshal(tags)
	_, err := r.db.Exec(ctx, `
		INSERT INTO test_manifests (id, name, suite, tags, version, owner, yaml_content, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()::TEXT)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			suite = EXCLUDED.suite,
			tags = EXCLUDED.tags,
			version = EXCLUDED.version,
			owner = EXCLUDED.owner,
			yaml_content = EXCLUDED.yaml_content,
			updated_at = NOW()::TEXT,
			deleted_at = NULL
	`, id, name, suite, string(tagsJSON), version, owner, yamlContent)
	return err
}

func (r *ManifestRepo) GetAll(ctx context.Context) ([]ManifestRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, suite, tags, version, owner, yaml_content, created_at, updated_at
		FROM test_manifests WHERE deleted_at IS NULL ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ManifestRow
	for rows.Next() {
		var m ManifestRow
		if err := rows.Scan(&m.ID, &m.Name, &m.Suite, &m.Tags, &m.Version, &m.Owner, &m.YAMLContent, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, nil
}

func (r *ManifestRepo) GetByID(ctx context.Context, id string) (*ManifestRow, error) {
	var m ManifestRow
	err := r.db.QueryRow(ctx, `
		SELECT id, name, suite, tags, version, owner, yaml_content, created_at, updated_at
		FROM test_manifests WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&m.ID, &m.Name, &m.Suite, &m.Tags, &m.Version, &m.Owner, &m.YAMLContent, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *ManifestRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE test_manifests SET deleted_at = NOW()::TEXT WHERE id = $1 AND deleted_at IS NULL`, id)
	return err
}

func (r *ManifestRepo) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM test_manifests WHERE deleted_at IS NULL`).Scan(&count)
	return count, err
}

// Templates

func (r *ManifestRepo) UpsertTemplate(ctx context.Context, id, name, yamlContent string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO step_templates (id, name, yaml_content, updated_at)
		VALUES ($1, $2, $3, NOW()::TEXT)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			yaml_content = EXCLUDED.yaml_content,
			updated_at = NOW()::TEXT
	`, id, name, yamlContent)
	return err
}

func (r *ManifestRepo) GetAllTemplates(ctx context.Context) ([]TemplateRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, yaml_content, created_at, updated_at
		FROM step_templates ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TemplateRow
	for rows.Next() {
		var t TemplateRow
		if err := rows.Scan(&t.ID, &t.Name, &t.YAMLContent, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, nil
}
