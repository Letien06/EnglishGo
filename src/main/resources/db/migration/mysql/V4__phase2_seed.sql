INSERT INTO vocab_sets (id, title, topic, level) VALUES
    (1, 'TOEIC Office Essentials', 'Business', 'B1');

INSERT INTO vocab_words (id, set_id, word, meaning, phonetic, example, audio_url) VALUES
    (1, 1, 'invoice', 'A document listing goods or services and the amount to pay.', '/ˈɪn.vɔɪs/', 'Please send the invoice before Friday.', NULL),
    (2, 1, 'deadline', 'The latest time or date by which something must be completed.', '/ˈded.laɪn/', 'The deadline for the report is Monday.', NULL),
    (3, 1, 'schedule', 'A plan that lists events or tasks and their times.', '/ˈskedʒ.uːl/', 'The meeting schedule has changed.', NULL);

INSERT INTO lessons (id, title, topic, content, video_url) VALUES
    (1, 'Using Prepositions for Deadlines', 'Grammar', 'Use "by" to mean no later than a deadline. Use "on" for a specific day and "at" for a specific time.', NULL);
