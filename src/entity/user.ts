import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";
import { Length, IsEmail } from "class-validator";

@Entity()
export class User {
    @PrimaryGeneratedColumn() id: number;

    @Column({
        length: 80
    })
    @Length(10, 80)
    name: string;

    @Column({
        length: 100
    })
    @Length(10, 100)
    @IsEmail()
    email: string;
}

export enum Github2WeChat {
    AnneXuHui = 100000202,
    cman2618 = 100000053,
    Highsys = 100000048,
    JamesYuen = 100000060,
    JingYuazaas = 100000510,
    liumeixiaazaas = 100000516,
    LiuQing1997 = 100000210,
    visionlzy = 100000148,
    wilson2young = 100000051,
}