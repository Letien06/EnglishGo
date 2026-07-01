ALTER TABLE vocab_words
    ADD COLUMN part_of_speech VARCHAR(50);

CREATE INDEX idx_vocab_words_part_of_speech ON vocab_words (part_of_speech);
