INSERT INTO users (
    id,
    firebase_uid,
    email,
    display_name,
    avatar_url,
    role,
    level,
    target_score
) VALUES (
    1,
    'seed-teacher-firebase-uid',
    'teacher@example.com',
    'Seed Teacher',
    NULL,
    'TEACHER',
    'B2',
    850
);

INSERT INTO tests (
    id,
    title,
    type,
    duration,
    difficulty,
    version,
    created_by
) VALUES (
    1,
    'TOEIC Mini Practice Test 1',
    'TOEIC',
    20,
    'EASY',
    1,
    1
);

INSERT INTO question_groups (
    id,
    test_id,
    passage_text,
    audio_url,
    image_url
) VALUES (
    1,
    1,
    'Questions 1 and 2 refer to the following conversation. A customer is calling a language center to ask about an English course schedule.',
    'audio/toeic-mini/conversation-01.mp3',
    NULL
);

INSERT INTO questions (
    id,
    test_id,
    group_id,
    part,
    type,
    content,
    audio_url,
    image_url,
    explanation
) VALUES
    (
        1,
        1,
        1,
        3,
        'MULTIPLE_CHOICE',
        'What does the customer want to know?',
        NULL,
        NULL,
        'The customer asks about the course schedule, so the correct option is the class time.'
    ),
    (
        2,
        1,
        1,
        3,
        'MULTIPLE_CHOICE',
        'When does the evening class begin?',
        NULL,
        NULL,
        'The conversation states that the evening class begins at 7:00 p.m.'
    ),
    (
        3,
        1,
        NULL,
        5,
        'MULTIPLE_CHOICE',
        'The manager asked the team to submit the report ______ Friday.',
        NULL,
        NULL,
        'The preposition "by" means no later than a deadline.'
    ),
    (
        4,
        1,
        NULL,
        5,
        'FILL_IN_BLANK',
        'Complete the sentence: The workshop will be held in the main ______.',
        NULL,
        NULL,
        'Accepted answers include "hall" and "auditorium".'
    );

INSERT INTO answer_options (
    id,
    question_id,
    content,
    is_correct
) VALUES
    (1, 1, 'The course schedule', TRUE),
    (2, 1, 'The price of textbooks', FALSE),
    (3, 1, 'The teacher''s email address', FALSE),
    (4, 1, 'The final exam results', FALSE),
    (5, 2, 'At 6:00 p.m.', FALSE),
    (6, 2, 'At 7:00 p.m.', TRUE),
    (7, 2, 'At 8:30 p.m.', FALSE),
    (8, 2, 'At 9:00 p.m.', FALSE),
    (9, 3, 'by', TRUE),
    (10, 3, 'at', FALSE),
    (11, 3, 'on', FALSE),
    (12, 3, 'from', FALSE);

INSERT INTO accepted_answers (
    id,
    question_id,
    answer_text,
    case_sensitive
) VALUES
    (1, 4, 'hall', FALSE),
    (2, 4, 'auditorium', FALSE);
