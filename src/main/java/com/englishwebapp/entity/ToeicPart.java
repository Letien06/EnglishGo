package com.englishwebapp.entity;

public enum ToeicPart {
    PART_1(1),
    PART_2(2),
    PART_3(3),
    PART_4(4),
    PART_5(5),
    PART_6(6),
    PART_7(7);

    private final int number;

    ToeicPart(int number) {
        this.number = number;
    }

    public int number() {
        return number;
    }

    public static ToeicPart fromNumber(Integer number) {
        if (number == null) {
            return null;
        }
        for (ToeicPart part : values()) {
            if (part.number == number) {
                return part;
            }
        }
        throw new IllegalArgumentException("Unsupported TOEIC part: " + number);
    }
}
